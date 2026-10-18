import type { OrderStatus } from "@prisma/client";
import {
  addStoreDays,
  adminReportsQuerySchema,
  adminSalesQuerySchema,
  FINLAND_VAT_RATE,
  productPricing,
  roundMoney,
  storeCalendarDate,
  storeDayEnd,
  storeDayStart,
  vatFromInclusive,
  type SalesGroup,
  type SalesRange,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { decryptOrEmpty } from "../lib/crypto.js";

const SOLD: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPING", "WITH_COURIER", "DELIVERED"];

function ymdParts(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

function shiftYmd(ymd: string, days: number) {
  return storeCalendarDate(addStoreDays(storeDayStart(ymd), days));
}

function startOfIsoWeek(ymd: string) {
  const { year, month, day } = ymdParts(ymd);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (weekday - 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isoWeekKey(ymd: string) {
  const { year, month, day } = ymdParts(ymd);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const jan1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function defaultGroup(range: SalesRange): SalesGroup {
  if (range === "this_year" || range === "last_year" || range === "last_12_months") return "month";
  if (range === "last_30_days" || range === "this_month" || range === "last_month") return "week";
  return "day";
}

function rangeWindow(range: SalesRange) {
  const today = storeCalendarDate();
  const { year, month } = ymdParts(today);
  if (range === "last_7_days") return { from: shiftYmd(today, -6), to: today };
  if (range === "last_30_days") return { from: shiftYmd(today, -29), to: today };
  if (range === "last_12_months") return { from: shiftYmd(today, -364), to: today };
  if (range === "this_week") return { from: startOfIsoWeek(today), to: today };
  if (range === "last_week") {
    const end = shiftYmd(startOfIsoWeek(today), -1);
    return { from: startOfIsoWeek(end), to: end };
  }
  if (range === "this_month") {
    return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: today };
  }
  if (range === "last_month") {
    const firstThis = `${year}-${String(month).padStart(2, "0")}-01`;
    const last = shiftYmd(firstThis, -1);
    const { year: ly, month: lm } = ymdParts(last);
    return { from: `${ly}-${String(lm).padStart(2, "0")}-01`, to: last };
  }
  if (range === "this_year") return { from: `${year}-01-01`, to: today };
  return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
}

function bucketKey(ymd: string, group: SalesGroup) {
  if (group === "year") return ymd.slice(0, 4);
  if (group === "month") return ymd.slice(0, 7);
  if (group === "week") return isoWeekKey(ymd);
  return ymd;
}

function bucketLabel(key: string, group: SalesGroup) {
  if (group === "year") return key;
  if (group === "month") {
    const [year, month] = key.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  if (group === "week") return `Week ${key.slice(6)} ${key.slice(0, 4)}`;
  return key;
}

function walkBuckets(from: string, to: string, group: SalesGroup) {
  const keys: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 800) {
    const key = bucketKey(cursor, group);
    if (keys[keys.length - 1] !== key) keys.push(key);
    cursor = shiftYmd(cursor, 1);
    guard += 1;
  }
  return keys;
}

export const salesService = {
  async report(rawQuery: unknown) {
    const query = adminSalesQuerySchema.parse(rawQuery);
    const group = query.group ?? defaultGroup(query.range);
    const { from, to } = rangeWindow(query.range);
    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          status: { in: SOLD },
          createdAt: { gte: storeDayStart(from), lte: storeDayEnd(to) },
        },
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.category
          ? { product: { category: { slug: query.category } } }
          : {}),
      },
      select: {
        quantity: true,
        lineTotal: true,
        order: { select: { id: true, createdAt: true } },
        product: { select: { wholesalePrice: true, vatRate: true, name: true } },
      },
    });

    const buckets = new Map<string, { revenue: number; units: number; vat: number; profit: number; orders: Set<string> }>();
    for (const key of walkBuckets(from, to, group)) {
      buckets.set(key, { revenue: 0, units: 0, vat: 0, profit: 0, orders: new Set() });
    }

    for (const item of items) {
      const ymd = storeCalendarDate(item.order.createdAt);
      const key = bucketKey(ymd, group);
      const bucket = buckets.get(key) ?? { revenue: 0, units: 0, vat: 0, profit: 0, orders: new Set<string>() };
      const revenue = Number(item.lineTotal);
      const rate = item.product.vatRate == null ? FINLAND_VAT_RATE : Number(item.product.vatRate);
      const pricing = productPricing(
        revenue,
        item.product.wholesalePrice == null ? null : Number(item.product.wholesalePrice) * item.quantity,
        rate,
      );
      bucket.revenue += revenue;
      bucket.units += item.quantity;
      bucket.vat += pricing.vat;
      bucket.profit += pricing.margin ?? 0;
      bucket.orders.add(item.order.id);
      buckets.set(key, bucket);
    }

    const series = [...buckets.entries()].map(([key, bucket]) => ({
      key,
      label: bucketLabel(key, group),
      revenue: Number(bucket.revenue.toFixed(2)),
      units: bucket.units,
      vat: Number(bucket.vat.toFixed(2)),
      profit: Number(bucket.profit.toFixed(2)),
      orders: bucket.orders.size,
    }));

    const totals = series.reduce(
      (sum, row) => ({
        revenue: sum.revenue + row.revenue,
        units: sum.units + row.units,
        vat: sum.vat + row.vat,
        profit: sum.profit + row.profit,
        orders: sum.orders + row.orders,
      }),
      { revenue: 0, units: 0, vat: 0, profit: 0, orders: 0 },
    );
    totals.revenue = Number(totals.revenue.toFixed(2));
    totals.vat = Number(totals.vat.toFixed(2));
    totals.profit = Number(totals.profit.toFixed(2));
    totals.orders = new Set(items.map((item) => item.order.id)).size;

    return {
      range: query.range,
      group,
      from,
      to,
      filters: { productId: query.productId ?? null, category: query.category ?? null },
      series,
      totals,
    };
  },

  async overview(rawQuery: unknown) {
    const query = adminReportsQuerySchema.parse(rawQuery);
    const group = query.group ?? defaultGroup(query.range);
    const { from, to } = rangeWindow(query.range);
    const createdAt = { gte: storeDayStart(from), lte: storeDayEnd(to) };
    const [sold, refunded] = await Promise.all([
      prisma.order.findMany({
        where: { status: { in: SOLD }, createdAt },
        select: {
          id: true,
          createdAt: true,
          total: true,
          shippingCost: true,
          tax: true,
          userId: true,
          contactEmailEnc: true,
          items: {
            select: {
              quantity: true,
              lineTotal: true,
              product: { select: { wholesalePrice: true, vatRate: true } },
            },
          },
        },
      }),
      prisma.order.findMany({
        where: { status: "REFUNDED", createdAt },
        select: { id: true, createdAt: true, total: true },
      }),
    ]);

    type Bucket = {
      customerAmount: number;
      productSales: number;
      shipping: number;
      vat: number;
      refunds: number;
      margin: number;
      units: number;
      orders: Set<string>;
      customers: Set<string>;
    };
    const buckets = new Map<string, Bucket>();
    for (const key of walkBuckets(from, to, group)) {
      buckets.set(key, emptyOverviewBucket());
    }

    const allCustomers = new Set<string>();
    for (const order of sold) {
      const ymd = storeCalendarDate(order.createdAt);
      const key = bucketKey(ymd, group);
      const bucket = buckets.get(key) ?? emptyOverviewBucket();
      const customerAmount = Number(order.total);
      const shipping = Number(order.shippingCost);
      const storedTax = Number(order.tax);
      const vat = storedTax > 0 ? storedTax : vatFromInclusive(customerAmount);
      const buyer = buyerKey(order);
      bucket.customerAmount += customerAmount;
      bucket.shipping += shipping;
      bucket.vat += vat;
      bucket.orders.add(order.id);
      bucket.customers.add(buyer);
      allCustomers.add(buyer);
      for (const item of order.items) {
        const productSales = Number(item.lineTotal);
        const rate = item.product.vatRate == null ? FINLAND_VAT_RATE : Number(item.product.vatRate);
        const pricing = productPricing(
          productSales,
          item.product.wholesalePrice == null ? null : Number(item.product.wholesalePrice) * item.quantity,
          rate,
        );
        bucket.productSales += productSales;
        bucket.units += item.quantity;
        bucket.margin += pricing.margin ?? 0;
      }
      buckets.set(key, bucket);
    }

    for (const order of refunded) {
      const ymd = storeCalendarDate(order.createdAt);
      const key = bucketKey(ymd, group);
      const bucket = buckets.get(key) ?? emptyOverviewBucket();
      bucket.refunds += Number(order.total);
      buckets.set(key, bucket);
    }

    const series = [...buckets.entries()].map(([key, bucket]) => overviewRow(key, group, bucket));
    const totals = emptyOverviewTotals();
    for (const row of series) {
      totals.customerAmount += row.customerAmount;
      totals.productSales += row.productSales;
      totals.shipping += row.shipping;
      totals.vat += row.vat;
      totals.refunds += row.refunds;
      totals.margin += row.margin;
    }
    totals.customerAmount = roundMoney(totals.customerAmount);
    totals.productSales = roundMoney(totals.productSales);
    totals.shipping = roundMoney(totals.shipping);
    totals.vat = roundMoney(totals.vat);
    totals.netOfVat = roundMoney(totals.customerAmount - totals.vat);
    totals.refunds = roundMoney(totals.refunds);
    totals.netSales = roundMoney(totals.customerAmount - totals.refunds);
    totals.margin = roundMoney(totals.margin);
    totals.orders = sold.length;
    totals.units = sold.reduce((sum, order) => sum + order.items.reduce((units, item) => units + item.quantity, 0), 0);
    totals.customers = allCustomers.size;
    totals.aov = totals.orders ? roundMoney(totals.customerAmount / totals.orders) : 0;

    return { range: query.range, group, from, to, series, totals };
  },

  async customers(rawQuery: unknown) {
    const query = adminReportsQuerySchema.parse(rawQuery);
    const { from, to } = rangeWindow(query.range);
    const createdAt = { gte: storeDayStart(from), lte: storeDayEnd(to) };
    const [sold, prior] = await Promise.all([
      prisma.order.findMany({
        where: { status: { in: SOLD }, createdAt },
        select: {
          id: true,
          userId: true,
          contactEmailEnc: true,
          contactNameEnc: true,
          total: true,
          user: { select: { email: true, displayName: true } },
          items: { select: { quantity: true } },
        },
      }),
      prisma.order.findMany({
        where: { status: { in: SOLD }, createdAt: { lt: storeDayStart(from) } },
        select: { userId: true, contactEmailEnc: true },
      }),
    ]);

    const returningKeys = new Set(prior.map((order) => buyerKey(order)));
    const buyers = new Map<
      string,
      { name: string; email: string; orders: number; units: number; customerAmount: number; returning: boolean }
    >();
    for (const order of sold) {
      const key = buyerKey(order);
      const current = buyers.get(key) ?? {
        name: buyerName(order),
        email: buyerEmail(order),
        orders: 0,
        units: 0,
        customerAmount: 0,
        returning: returningKeys.has(key),
      };
      current.orders += 1;
      current.units += order.items.reduce((sum, item) => sum + item.quantity, 0);
      current.customerAmount = roundMoney(current.customerAmount + Number(order.total));
      buyers.set(key, current);
    }

    const items = [...buyers.values()]
      .sort((a, b) => b.customerAmount - a.customerAmount || b.orders - a.orders || a.name.localeCompare(b.name))
      .slice(0, 50);
    const unique = buyers.size;
    const returning = [...buyers.values()].filter((row) => row.returning).length;
    const customerAmount = roundMoney([...buyers.values()].reduce((sum, row) => sum + row.customerAmount, 0));
    const orderCount = sold.length;

    return {
      range: query.range,
      from,
      to,
      totals: {
        customers: unique,
        newCustomers: unique - returning,
        returningCustomers: returning,
        customerAmount,
        orders: orderCount,
        aov: orderCount ? roundMoney(customerAmount / orderCount) : 0,
      },
      items,
    };
  },
};

function emptyOverviewBucket() {
  return {
    customerAmount: 0,
    productSales: 0,
    shipping: 0,
    vat: 0,
    refunds: 0,
    margin: 0,
    units: 0,
    orders: new Set<string>(),
    customers: new Set<string>(),
  };
}

function emptyOverviewTotals() {
  return {
    customerAmount: 0,
    productSales: 0,
    shipping: 0,
    vat: 0,
    netOfVat: 0,
    refunds: 0,
    netSales: 0,
    margin: 0,
    orders: 0,
    units: 0,
    customers: 0,
    aov: 0,
  };
}

function overviewRow(
  key: string,
  group: SalesGroup,
  bucket: ReturnType<typeof emptyOverviewBucket>,
) {
  const customerAmount = roundMoney(bucket.customerAmount);
  const vat = roundMoney(bucket.vat);
  const refunds = roundMoney(bucket.refunds);
  return {
    key,
    label: bucketLabel(key, group),
    customerAmount,
    productSales: roundMoney(bucket.productSales),
    shipping: roundMoney(bucket.shipping),
    vat,
    netOfVat: roundMoney(customerAmount - vat),
    refunds,
    netSales: roundMoney(customerAmount - refunds),
    margin: roundMoney(bucket.margin),
    orders: bucket.orders.size,
    units: bucket.units,
    customers: bucket.customers.size,
  };
}

function buyerKey(order: { id?: string; userId?: string | null; contactEmailEnc: string }) {
  if (order.userId) return `user:${order.userId}`;
  const email = decryptOrEmpty(order.contactEmailEnc).trim().toLowerCase();
  return email || `anon:${order.id ?? "unknown"}`;
}

function buyerEmail(order: { user?: { email: string } | null; contactEmailEnc: string }) {
  return order.user?.email || decryptOrEmpty(order.contactEmailEnc) || "—";
}

function buyerName(order: {
  user?: { displayName: string | null; email: string } | null;
  contactNameEnc: string;
  contactEmailEnc: string;
}) {
  return (
    order.user?.displayName ||
    decryptOrEmpty(order.contactNameEnc) ||
    order.user?.email ||
    decryptOrEmpty(order.contactEmailEnc) ||
    "Guest"
  );
}
