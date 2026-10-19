import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import {
  addStoreDays,
  DEMO_ADMIN_TOTP_SECRET,
  ean13FromIndex,
  EXPRESS_SHIPPING,
  FINLAND_VAT_RATE,
  formatLocatorCode,
  FREE_STANDARD_THRESHOLD,
  locatorFromIndex,
  netFromInclusive,
  POSTI_PACKAGE_SIZES,
  roundMoney,
  STANDARD_SHIPPING,
} from "@volt/shared";
import { decrypt, encrypt, encryptJson, encryptOptional, revealSecret } from "../src/lib/crypto.js";
import { writeDerivedImages } from "../src/lib/images.js";

const prisma = new PrismaClient();
const uploadDir = process.env.UPLOAD_DIR ?? "uploads";
const seedImagesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-images");

function kgToLb(kg: number) {
  return Number((kg * 2.20462).toFixed(3));
}

function cmToIn(cm: number) {
  return Number((cm / 2.54).toFixed(2));
}

function wholesaleOf(retail: number) {
  return roundMoney(netFromInclusive(retail) * 0.68);
}

function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars && !current) {
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function svg(name: string, color: string, label: string) {
  const lines = wrapLabel(label, 22);
  const fontSize = lines.length > 2 ? 34 : 42;
  const lineHeight = fontSize + 10;
  const startY = 390 - ((lines.length - 1) * lineHeight) / 2;
  const title = lines
    .map(
      (line, index) =>
        `<text x="400" y="${startY + index * lineHeight}" text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}" fill="#f7f4ec">${escapeXml(line)}</text>`,
    )
    .join("\n  ");
  const brandY = startY + lines.length * lineHeight + 8;
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${escapeXml(label)}">
  <rect width="800" height="800" fill="#f3efe6"/>
  <rect x="80" y="80" width="640" height="640" rx="36" fill="${color}"/>
  ${title}
  <text x="400" y="${brandY}" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#d9d0bc">Volt &amp; Co</text>
</svg>`;
  mkdirSync(uploadDir, { recursive: true });
  writeFileSync(path.join(uploadDir, name), content);
}

function placeProductImage(slug: string, label: string, color: string): string {
  mkdirSync(uploadDir, { recursive: true });
  const jpgName = `${slug}.jpg`;
  const src = path.join(seedImagesDir, jpgName);
  if (existsSync(src)) {
    copyFileSync(src, path.join(uploadDir, jpgName));
    return jpgName;
  }
  const svgName = `${slug}.svg`;
  svg(svgName, color, label);
  return svgName;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

type SeedProduct = {
  name: string;
  slug: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  brand: string;
  kg: number;
  l: number;
  w: number;
  h: number;
  color: string;
  featured?: boolean;
  rating: number;
  modelCode?: string;
  colorName?: string;
  warrantyMonths?: number;
  warrantyNote?: string;
  manufacturerUrl?: string;
  brandUrl?: string;
  packageContents?: string;
  highlights?: string;
  releaseYear?: number;
  energyClass?: string;
  attributes: { name: string; value: string }[];
};

const BRAND_SITES: Record<string, string> = {
  sony: "https://www.sony.fi",
  bose: "https://www.bose.com",
  apple: "https://www.apple.com/fi",
  samsung: "https://www.samsung.com/fi",
  framework: "https://frame.work",
  google: "https://store.google.com",
  logitech: "https://www.logitech.com",
  anker: "https://www.anker.com",
  keychron: "https://www.keychron.com",
  philips: "https://www.philips-hue.com",
  nothing: "https://www.nothing.tech",
};

function productInformation(product: SeedProduct) {
  return {
    modelCode: product.modelCode ?? null,
    colorName: product.colorName ?? null,
    warrantyMonths: product.warrantyMonths ?? 24,
    warrantyNote: product.warrantyNote ?? "Manufacturer warranty",
    manufacturerUrl: product.manufacturerUrl ?? null,
    brandUrl: product.brandUrl ?? BRAND_SITES[product.brand] ?? null,
    packageContents: product.packageContents ?? null,
    highlights: product.highlights ?? null,
    releaseYear: product.releaseYear ?? null,
    energyClass: product.energyClass ?? null,
  };
}

const products: SeedProduct[] = [
  {
    name: "Sony WH-1000XM5",
    slug: "sony-wh-1000xm5",
    description:
      "Industry-leading noise cancellation, 30-hour battery, and a plush over-ear fit for long listening sessions.",
    price: 349.99,
    stock: 24,
    category: "audio",
    brand: "sony",
    kg: 0.25,
    l: 19.5,
    w: 16.5,
    h: 8.0,
    color: "#1f3a5f",
    featured: true,
    rating: 4.7,
    modelCode: "WH-1000XM5",
    colorName: "Black",
    releaseYear: 2022,
    manufacturerUrl: "https://www.sony.com/electronics/headband-headphones/wh-1000xm5",
    highlights:
      "8-microphone noise cancellation\nHigh-resolution audio\nPrecise voice pickup\nSmart, intuitive controls\nUp to 30-hour battery",
    packageContents: "Headphones\nCarrying case\nUSB-C charging cable\n3.5 mm audio cable",
    attributes: [
      { name: "Color", value: "Black" },
      { name: "Wireless", value: "Yes" },
      { name: "Noise cancelling", value: "Yes" },
      { name: "Battery life", value: "Up to 30 hours" },
      { name: "Connectivity", value: "Bluetooth 5.2" },
      { name: "Charging", value: "USB-C" },
      { name: "Driver", value: "30 mm" },
    ],
  },
  {
    name: "Bose QuietComfort Ultra",
    slug: "bose-quietcomfort-ultra",
    description:
      "Immersive audio with spatial modes and Bose's signature quiet, designed for travel and deep focus.",
    price: 429.0,
    stock: 18,
    category: "audio",
    brand: "bose",
    kg: 0.25,
    l: 19.6,
    w: 17.0,
    h: 7.6,
    color: "#3d3a36",
    featured: true,
    rating: 4.6,
    modelCode: "QC Ultra",
    colorName: "Black",
    releaseYear: 2023,
    manufacturerUrl: "https://www.bose.com/p/headphones/bose-quietcomfort-ultra-headphones",
    highlights: "Immersive spatial audio\nCustomTune noise cancellation\nComfort-first ear cushions\nUp to 24-hour battery",
    packageContents: "Headphones\nCarry case\nUSB-C cable\n3.5 mm audio cable",
    attributes: [
      { name: "Color", value: "Black" },
      { name: "Wireless", value: "Yes" },
      { name: "Noise cancelling", value: "Yes" },
      { name: "Battery life", value: "Up to 24 hours" },
      { name: "Connectivity", value: "Bluetooth 5.3" },
    ],
  },
  {
    name: "Apple AirPods Pro (2nd generation)",
    slug: "apple-airpods-pro-2",
    description:
      "In-ear ANC earbuds with Adaptive Audio, MagSafe charging case, and seamless pairing across Apple devices.",
    price: 249.0,
    stock: 40,
    category: "audio",
    brand: "apple",
    kg: 0.056,
    l: 6.1,
    w: 4.6,
    h: 2.2,
    color: "#6e7c7a",
    rating: 4.8,
    modelCode: "MTJV3",
    colorName: "White",
    releaseYear: 2022,
    manufacturerUrl: "https://www.apple.com/airpods-pro/",
    highlights: "Adaptive Audio\nActive Noise Cancellation\nMagSafe charging case\nSeamless Apple pairing",
    packageContents: "AirPods Pro\nMagSafe Charging Case\nSilicone ear tips (4 sizes)\nUSB-C cable",
    attributes: [
      { name: "Color", value: "White" },
      { name: "Wireless", value: "Yes" },
      { name: "Noise cancelling", value: "Yes" },
      { name: "Battery life", value: "Up to 6 hours" },
      { name: "Charging", value: "USB-C / MagSafe" },
    ],
  },
  {
    name: "Framework Laptop 13 DIY Edition",
    slug: "framework-laptop-13",
    description:
      "A repairable 13.5-inch laptop with swappable ports, upgradeable RAM and storage, and a matte 3:2 display.",
    price: 1099.0,
    stock: 12,
    category: "computers",
    brand: "framework",
    kg: 1.3,
    l: 29.7,
    w: 22.8,
    h: 1.58,
    color: "#2c4a3e",
    featured: true,
    rating: 4.5,
    modelCode: "FW13-DIY",
    colorName: "Silver",
    releaseYear: 2023,
    energyClass: "C",
    manufacturerUrl: "https://frame.work/laptop13",
    highlights: "Repairable 13.5-inch design\nSwappable expansion cards\nUpgradeable RAM and storage\nMatte 3:2 display",
    packageContents: "Laptop\nUSB-C power adapter\nQuick start guide",
    attributes: [
      { name: "Screen", value: "13.5 inch" },
      { name: "Storage", value: "512 GB" },
      { name: "Memory", value: "16 GB" },
      { name: "Ports", value: "4 expansion cards" },
    ],
  },
  {
    name: "Apple MacBook Air 15-inch (M3)",
    slug: "macbook-air-15-m3",
    description:
      "Fanless 15-inch notebook with the M3 chip, Liquid Retina display, and all-day battery for work and media.",
    price: 1299.0,
    stock: 9,
    category: "computers",
    brand: "apple",
    kg: 1.51,
    l: 34.04,
    w: 23.76,
    h: 1.15,
    color: "#5a6b7a",
    featured: true,
    rating: 4.8,
    modelCode: "M3 Air 15",
    colorName: "Midnight",
    releaseYear: 2024,
    energyClass: "B",
    manufacturerUrl: "https://www.apple.com/macbook-air-15/",
    highlights: "Fanless 15-inch notebook\nApple M3 chip\nLiquid Retina display\nAll-day battery",
    packageContents: "MacBook Air\nUSB-C power adapter\nUSB-C charge cable",
    attributes: [
      { name: "Screen", value: "15.3 inch" },
      { name: "Storage", value: "256 GB" },
      { name: "Chip", value: "Apple M3" },
      { name: "Memory", value: "8 GB" },
    ],
  },
  {
    name: "Samsung Galaxy S24",
    slug: "samsung-galaxy-s24",
    description:
      "Compact flagship Android phone with a bright AMOLED panel, triple camera, and seven years of OS updates.",
    price: 799.0,
    stock: 22,
    category: "phones",
    brand: "samsung",
    kg: 0.167,
    l: 14.7,
    w: 7.06,
    h: 0.76,
    color: "#3b4d63",
    rating: 4.4,
    modelCode: "SM-S921B",
    colorName: "Onyx Black",
    releaseYear: 2024,
    energyClass: "B",
    manufacturerUrl: "https://www.samsung.com/fi/smartphones/galaxy-s24/",
    highlights: "Compact flagship Android\nBright AMOLED display\nTriple camera\nSeven years of OS updates",
    packageContents: "Phone\nUSB-C cable\nSIM tool\nQuick start guide",
    attributes: [
      { name: "Color", value: "Onyx Black" },
      { name: "Storage", value: "128 GB" },
      { name: "Display", value: "6.2 inch AMOLED" },
      { name: "SIM", value: "Dual SIM / eSIM" },
    ],
  },
  {
    name: "Google Pixel 8",
    slug: "google-pixel-8",
    description:
      "Google's computational photography in a compact body, with seven years of updates and a smooth 120 Hz display.",
    price: 699.0,
    stock: 15,
    category: "phones",
    brand: "google",
    kg: 0.187,
    l: 15.05,
    w: 7.08,
    h: 0.89,
    color: "#6a5340",
    rating: 4.5,
    modelCode: "GZPF0",
    colorName: "Hazel",
    releaseYear: 2023,
    energyClass: "B",
    manufacturerUrl: "https://store.google.com/product/pixel_8",
    highlights: "Computational photography\nSeven years of updates\nSmooth 120 Hz display\nCompact flagship body",
    packageContents: "Phone\nUSB-C cable\nSIM tool",
    attributes: [
      { name: "Color", value: "Hazel" },
      { name: "Storage", value: "128 GB" },
      { name: "Display", value: "6.2 inch OLED" },
      { name: "Chip", value: "Google Tensor G3" },
    ],
  },
  {
    name: "Apple Watch Series 10",
    slug: "apple-watch-series-10",
    description:
      "Thinner aluminum watch with a brighter always-on display, sleep tracking, and fast charging.",
    price: 399.0,
    stock: 30,
    category: "wearables",
    brand: "apple",
    kg: 0.03,
    l: 4.2,
    w: 3.6,
    h: 0.96,
    color: "#8a8f7a",
    rating: 4.6,
    modelCode: "A2997",
    colorName: "Silver",
    releaseYear: 2024,
    manufacturerUrl: "https://www.apple.com/watch/",
    highlights: "Thinner aluminum case\nBrighter always-on display\nSleep tracking\nFast charging",
    packageContents: "Apple Watch\nSport Band\nUSB-C magnetic charger",
    attributes: [
      { name: "Size", value: "42 mm" },
      { name: "Color", value: "Silver" },
      { name: "Case", value: "Aluminum" },
      { name: "Water resistance", value: "50 m" },
    ],
  },
  {
    name: "Logitech MX Master 3S",
    slug: "logitech-mx-master-3s",
    description:
      "Quiet MagSpeed scrolling, USB-C charging, and a sculpted shape for all-day desk work across three computers.",
    price: 99.99,
    stock: 50,
    category: "accessories",
    brand: "logitech",
    kg: 0.141,
    l: 12.4,
    w: 8.4,
    h: 5.1,
    color: "#3f3f3f",
    rating: 4.7,
    modelCode: "MX Master 3S",
    colorName: "Graphite",
    releaseYear: 2022,
    manufacturerUrl: "https://www.logitech.com/products/mice/mx-master-3s.html",
    highlights: "Quiet MagSpeed scrolling\nUSB-C charging\nSculpted all-day shape\nWorks across three computers",
    packageContents: "Mouse\nUSB-C cable\nLogi Bolt receiver",
    attributes: [
      { name: "Color", value: "Graphite" },
      { name: "Wireless", value: "Yes" },
      { name: "Buttons", value: "7" },
      { name: "Sensor", value: "8000 DPI" },
    ],
  },
  {
    name: "Anker 737 Power Bank",
    slug: "anker-737-power-bank",
    description:
      "24,000 mAh USB-C power bank with 140W output, a status screen, and enough headroom to charge a laptop.",
    price: 149.99,
    stock: 28,
    category: "accessories",
    brand: "anker",
    kg: 0.63,
    l: 15.6,
    w: 5.4,
    h: 4.9,
    color: "#1c1c1c",
    rating: 4.6,
    modelCode: "A1289",
    colorName: "Black",
    releaseYear: 2022,
    manufacturerUrl: "https://www.anker.com/products/a1289",
    highlights: "24,000 mAh capacity\n140W USB-C output\nStatus screen\nLaptop-ready headroom",
    packageContents: "Power bank\nUSB-C to USB-C cable\nTravel pouch",
    attributes: [
      { name: "Capacity", value: "24000 mAh" },
      { name: "Output", value: "140W" },
      { name: "Ports", value: "2× USB-C, 1× USB-A" },
    ],
  },
  {
    name: "Keychron Q1 Max",
    slug: "keychron-q1-max",
    description:
      "Wireless gasket-mounted 75% mechanical keyboard with a CNC aluminum case and hot-swap switches.",
    price: 209.0,
    stock: 16,
    category: "accessories",
    brand: "keychron",
    kg: 1.8,
    l: 32.8,
    w: 14.5,
    h: 4.2,
    color: "#5c4033",
    rating: 4.7,
    modelCode: "Q1 Max",
    colorName: "Carbon Black",
    releaseYear: 2023,
    manufacturerUrl: "https://www.keychron.com/products/keychron-q1-max-qmk-via-wireless-custom-mechanical-keyboard",
    highlights: "Wireless gasket-mounted 75%\nCNC aluminum case\nHot-swap switches\nQMK/VIA support",
    packageContents: "Keyboard\nUSB-C cable\nSwitch puller\nKeycap puller",
    attributes: [
      { name: "Layout", value: "75%" },
      { name: "Wireless", value: "Yes" },
      { name: "Switches", value: "Hot-swap" },
      { name: "Case", value: "Aluminum" },
    ],
  },
  {
    name: "Philips Hue White and Color Starter Kit",
    slug: "philips-hue-starter-kit",
    description:
      "Three color bulbs and a Hue Bridge so you can schedule lights, match scenes, and control them from your phone.",
    price: 179.99,
    stock: 20,
    category: "smart-home",
    brand: "philips",
    kg: 0.42,
    l: 18.5,
    w: 14.0,
    h: 8.5,
    color: "#c9a227",
    featured: true,
    rating: 4.4,
    modelCode: "Hue Starter",
    colorName: "Full color",
    releaseYear: 2023,
    energyClass: "F",
    manufacturerUrl: "https://www.philips-hue.com/en-fi/p/hue-white-and-color-ambiance-starter-kit/8718696725382",
    highlights: "Three color bulbs\nHue Bridge included\nSchedules and scenes\nApp and voice control",
    packageContents: "3 color bulbs\nHue Bridge\nEthernet cable\nPower adapter",
    attributes: [
      { name: "Bulbs", value: "3" },
      { name: "Color", value: "Full color" },
      { name: "Protocol", value: "Zigbee / Bluetooth" },
    ],
  },
  {
    name: "Samsung Odyssey G5 27-inch",
    slug: "samsung-odyssey-g5-27",
    description:
      "1000R curved 1440p gaming monitor with 165 Hz refresh, AMD FreeSync, and a thin three-sided bezel.",
    price: 249.99,
    stock: 11,
    category: "computers",
    brand: "samsung",
    kg: 4.1,
    l: 61.6,
    w: 27.2,
    h: 42.3,
    color: "#243044",
    rating: 4.3,
    modelCode: "LS27CG552EUXEN",
    colorName: "Black",
    releaseYear: 2022,
    energyClass: "F",
    manufacturerUrl: "https://www.samsung.com/monitor/gaming/odyssey-g5/",
    highlights: "1000R curved 1440p panel\n165 Hz refresh\nAMD FreeSync\nThin three-sided bezel",
    packageContents: "Monitor\nStand\nPower cable\nHDMI cable",
    attributes: [
      { name: "Screen", value: "27 inch" },
      { name: "Refresh", value: "165 Hz" },
      { name: "Resolution", value: "2560 × 1440" },
      { name: "Panel", value: "VA" },
    ],
  },
  {
    name: "Nothing Ear (a)",
    slug: "nothing-ear-a",
    description:
      "Transparent-stem earbuds with ANC, a light charging case, and a clean companion app.",
    price: 99.0,
    stock: 35,
    category: "audio",
    brand: "nothing",
    kg: 0.047,
    l: 4.8,
    w: 4.8,
    h: 2.2,
    color: "#e8e4d9",
    rating: 4.2,
    modelCode: "Ear (a)",
    colorName: "White",
    releaseYear: 2024,
    manufacturerUrl: "https://www.nothing.tech/products/ear-a",
    highlights: "Transparent-stem design\nActive noise cancellation\nLight charging case\nClean companion app",
    packageContents: "Earbuds\nCharging case\nEar tips\nUSB-C cable",
    attributes: [
      { name: "Color", value: "White" },
      { name: "Wireless", value: "Yes" },
      { name: "Noise cancelling", value: "Yes" },
      { name: "Battery life", value: "Up to 5.5 hours" },
    ],
  },
];

const WHOLESALERS = [
  {
    name: "ElectroNordic Oy",
    slug: "electronordic",
    email: "orders@electronordic.test",
    contactName: "Matti Korhonen",
    phone: "+358 9 123 4500",
    address: "Hermannin rantatie 12, 00580 Helsinki",
    notes: "Audio, wearables, and phone restocks. Lead time 3–5 days.",
    categories: ["audio", "wearables", "phones"],
  },
  {
    name: "Baltic IT Wholesale",
    slug: "baltic-it",
    email: "sales@balticit.test",
    contactName: "Eva Lindström",
    phone: "+358 9 555 2100",
    address: "Tammasaarenkatu 3, 00180 Helsinki",
    notes: "Computers and desk accessories. MOQ 4 on most SKUs.",
    categories: ["computers", "accessories"],
  },
  {
    name: "Nordic Lighting Supply",
    slug: "nordic-lighting",
    email: "hello@nordiclighting.test",
    contactName: "Sofia Berg",
    phone: "+358 2 410 880",
    address: "Linnankatu 18, 20100 Turku",
    notes: "Smart home and lighting only.",
    categories: ["smart-home"],
  },
] as const;

function wholesaleSkuFromSlug(slug: string) {
  return `VN-${slug.replaceAll("-", " ").toUpperCase().replaceAll(" ", "-")}`;
}

async function ensureWholesalers() {
  const map = new Map<string, { id: string; categories: readonly string[] }>();
  for (const row of WHOLESALERS) {
    const existing = await prisma.wholesaler.findFirst({
      where: { OR: [{ slug: row.slug }, { email: row.email }] },
    });
    const saved = existing
      ? await prisma.wholesaler.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            slug: row.slug,
            email: row.email,
            contactName: row.contactName,
            phone: row.phone,
            address: row.address,
            notes: row.notes,
          },
        })
      : await prisma.wholesaler.create({
          data: {
            name: row.name,
            slug: row.slug,
            email: row.email,
            contactName: row.contactName,
            phone: row.phone,
            address: row.address,
            notes: row.notes,
          },
        });
    map.set(row.slug, { id: saved.id, categories: row.categories });
  }
  return map;
}

function wholesalerIdForCategory(
  category: string,
  wholesalers: Map<string, { id: string; categories: readonly string[] }>,
) {
  for (const row of wholesalers.values()) {
    if (row.categories.includes(category)) return row.id;
  }
  return [...wholesalers.values()][0]?.id ?? null;
}

async function assignMissingBarcodes() {
  const missing = await prisma.product.findMany({
    where: { barcode: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const taken = new Set(
    (await prisma.product.findMany({ where: { barcode: { not: null } }, select: { barcode: true } })).map(
      (row) => row.barcode,
    ),
  );
  let index = 0;
  for (const product of missing) {
    let barcode = ean13FromIndex(index);
    while (taken.has(barcode)) {
      index += 1;
      barcode = ean13FromIndex(index);
    }
    await prisma.product.update({ where: { id: product.id }, data: { barcode } });
    taken.add(barcode);
    index += 1;
  }
}

async function removeEphemeralTestProducts() {
  const leftovers = await prisma.product.findMany({
    where: {
      OR: [{ name: { startsWith: "Volt Test Dongle" } }, { name: { startsWith: "Volt Bulk Cable" } }],
    },
    select: { id: true },
  });
  const ids = leftovers.map((row) => row.id);
  if (!ids.length) return 0;
  await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: ids } } });
  const orderRows = await prisma.orderItem.findMany({
    where: { productId: { in: ids } },
    select: { orderId: true },
  });
  const orderIds = [...new Set(orderRows.map((row) => row.orderId))];
  if (orderIds.length) {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.inventoryReservation.deleteMany({ where: { productId: { in: ids } } });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

async function assignProductInformation() {
  for (const product of products) {
    const row = await prisma.product.findFirst({
      where: { OR: [{ slug: product.slug }, { name: product.name }] },
      select: { id: true },
    });
    if (!row) continue;
    await prisma.product.update({
      where: { id: row.id },
      data: productInformation(product),
    });
    await prisma.productAttribute.deleteMany({ where: { productId: row.id } });
    if (product.attributes.length) {
      await prisma.productAttribute.createMany({
        data: product.attributes.map((attribute) => ({
          productId: row.id,
          name: attribute.name,
          value: attribute.value,
        })),
      });
    }
  }
}

async function ensureSonyPromotion() {
  const product = await prisma.product.findUnique({ where: { slug: "sony-wh-1000xm5" } });
  if (!product) return;
  const existing = await prisma.productPromotion.count({ where: { productId: product.id } });
  if (existing > 0 && product.promoPrice != null) return;

  const startsAt = addStoreDays(new Date(), -3);
  const endsAt = addStoreDays(new Date(), 14);
  const pastStart = addStoreDays(startsAt, -90);
  const pastEnd = addStoreDays(startsAt, -75);
  const regular = 349.99;
  const promo = 299.99;
  const lowest = 349.99;

  await prisma.productPriceHistory.deleteMany({ where: { productId: product.id } });
  await prisma.productPromotion.deleteMany({ where: { productId: product.id } });
  await prisma.productPriceHistory.createMany({
    data: [
      { productId: product.id, price: 379.99, recordedAt: addStoreDays(startsAt, -40) },
      { productId: product.id, price: 359.99, recordedAt: addStoreDays(startsAt, -20) },
      { productId: product.id, price: 349.99, recordedAt: addStoreDays(startsAt, -5) },
      { productId: product.id, price: 299.99, recordedAt: startsAt },
    ],
  });
  await prisma.productPromotion.createMany({
    data: [
      {
        productId: product.id,
        regularPrice: 379.99,
        promoPrice: 319.99,
        startsAt: pastStart,
        endsAt: pastEnd,
        lowestPriceBeforePromo: 379.99,
      },
      {
        productId: product.id,
        regularPrice: regular,
        promoPrice: promo,
        startsAt,
        endsAt,
        lowestPriceBeforePromo: lowest,
      },
    ],
  });
  await prisma.product.update({
    where: { id: product.id },
    data: {
      price: regular,
      promoPrice: promo,
      promoStartsAt: startsAt,
      promoEndsAt: endsAt,
      lowestPriceBeforePromo: lowest,
    },
  });
}

async function assignMissingWholesalePrices() {
  const products = await prisma.product.findMany({ where: { wholesalePrice: null } });
  for (const product of products) {
    await prisma.product.update({
      where: { id: product.id },
      data: { wholesalePrice: wholesaleOf(Number(product.price)), vatRate: FINLAND_VAT_RATE },
    });
  }
}

async function assignProductWholesalers(
  wholesalers: Map<string, { id: string; categories: readonly string[] }>,
) {
  const products = await prisma.product.findMany({
    where: { wholesalerId: null },
    include: { category: { select: { slug: true } } },
  });
  for (const product of products) {
    const wholesalerId = wholesalerIdForCategory(product.category.slug, wholesalers);
    if (!wholesalerId) continue;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        wholesalerId,
        wholesaleSku: product.wholesaleSku || wholesaleSkuFromSlug(product.slug),
      },
    });
  }
}

async function ensurePackageSizes() {
  for (const box of POSTI_PACKAGE_SIZES) {
    const stockQuantity = box.code === "XXL" ? 8 : 24;
    await prisma.packageSize.upsert({
      where: { code: box.code },
      update: {
        name: box.name,
        lengthCm: box.lengthCm,
        widthCm: box.widthCm,
        heightCm: box.heightCm,
        maxWeightKg: box.maxWeightKg,
        sortOrder: box.sortOrder,
        active: true,
      },
      create: {
        code: box.code,
        name: box.name,
        lengthCm: box.lengthCm,
        widthCm: box.widthCm,
        heightCm: box.heightCm,
        maxWeightKg: box.maxWeightKg,
        stockQuantity,
        incomingQuantity: 0,
        sortOrder: box.sortOrder,
        active: true,
      },
    });
  }
}

async function ensureRoles() {
  const names = ["customer", "admin", "support", "sales", "warehouse"] as const;
  const records = new Map<string, { id: string; name: string }>();
  for (const name of names) {
    const row = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    records.set(name, row);
  }
  return records;
}

async function ensureStaffUser(email: string, name: string, roleId: string) {
  const passwordHash = await argon2.hash("Shopping123");
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      emailVerifiedAt: new Date(),
      displayName: name,
      totpEnabled: true,
      roleId,
    },
    create: {
      email,
      displayName: name,
      passwordHash,
      emailVerifiedAt: new Date(),
      totpEnabled: true,
      roleId,
    },
  });
  const totpCipher = encrypt(DEMO_ADMIN_TOTP_SECRET);
  await prisma.totpSecret.upsert({
    where: { userId: user.id },
    update: { secret: totpCipher, confirmedAt: new Date(), backupCodes: [] },
    create: {
      userId: user.id,
      secret: totpCipher,
      confirmedAt: new Date(),
      backupCodes: [],
    },
  });
  return user;
}

async function ensureMissingStaffUser(email: string, name: string, roleId: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return ensureStaffUser(email, name, roleId);
}

const DEMO_STAFF_EMAILS = [
  "admin@volt.test",
  "support@volt.test",
  "sales@volt.test",
  "warehouse@volt.test",
] as const;

/** Re-encrypt the documented demo TOTP secret if the stored ciphertext is unreadable. */
async function ensureDemoTotpReadable(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { totpSecret: true },
  });
  if (!user) return;
  if (user.totpSecret?.secret) {
    try {
      revealSecret(user.totpSecret.secret);
      return;
    } catch {
      // Written with another DATA_ENCRYPTION_KEY — rewrite with the current one.
    }
  }
  const totpCipher = encrypt(DEMO_ADMIN_TOTP_SECRET);
  await prisma.totpSecret.upsert({
    where: { userId: user.id },
    update: { secret: totpCipher, confirmedAt: new Date() },
    create: {
      userId: user.id,
      secret: totpCipher,
      confirmedAt: new Date(),
      backupCodes: [],
    },
  });
  if (!user.totpEnabled) {
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  }
}

async function ensureDemoAddressesReadable() {
  const user = await prisma.user.findUnique({ where: { email: "customer@volt.test" } });
  if (!user) return;
  const rows = await prisma.address.findMany({ where: { userId: user.id } });
  let readable = 0;
  for (const row of rows) {
    try {
      decrypt(row.recipientNameEnc);
      decrypt(row.line1Enc);
      decrypt(row.cityEnc);
      decrypt(row.postalEnc);
      readable += 1;
    } catch {
      await prisma.address.delete({ where: { id: row.id } });
    }
  }
  if (readable > 0) return;
  await prisma.address.create({
    data: {
      userId: user.id,
      label: "Home",
      isDefault: true,
      recipientNameEnc: encrypt("Demo Customer"),
      line1Enc: encrypt("Mannerheimintie 12"),
      cityEnc: encrypt("Helsinki"),
      postalEnc: encrypt("00100"),
      country: "FI",
      phoneEnc: encryptOptional("+358401234567"),
    },
  });
}

async function main() {
  mkdirSync(uploadDir, { recursive: true });

  const roleRecords = await ensureRoles();
  const customerRole = roleRecords.get("customer")!;
  const adminRole = roleRecords.get("admin")!;
  const supportRole = roleRecords.get("support")!;
  const salesRole = roleRecords.get("sales")!;
  const warehouseRole = roleRecords.get("warehouse")!;

  const wholesalers = await ensureWholesalers();
  const removedTests = await removeEphemeralTestProducts();
  const existing = await prisma.product.count();
  if (existing > 0) {
    await assignProductWholesalers(wholesalers);
    await assignMissingBarcodes();
    await assignMissingWholesalePrices();
    await assignProductInformation();
    await ensureSonyPromotion();
    await ensureMissingStaffUser("warehouse@volt.test", "Volt Warehouse", warehouseRole.id);
    await ensurePackageSizes();
    for (const email of DEMO_STAFF_EMAILS) {
      await ensureDemoTotpReadable(email);
    }
    await ensureDemoAddressesReadable();
    console.log(
      `Catalog already has ${existing} products; removed ${removedTests} leftover test SKUs, attached missing wholesalers, barcodes, wholesale prices, product information, warehouse staff, and Posti package sizes and left readable 2FA and demo addresses intact.`,
    );
    return;
  }

  const categories = [
    { name: "Audio", slug: "audio", description: "Headphones, earbuds, and speakers" },
    { name: "Computers", slug: "computers", description: "Laptops, desktops, and displays" },
    { name: "Phones", slug: "phones", description: "Smartphones and accessories" },
    { name: "Wearables", slug: "wearables", description: "Watches and trackers" },
    { name: "Smart Home", slug: "smart-home", description: "Lights, hubs, and home tech" },
    { name: "Accessories", slug: "accessories", description: "Keyboards, mice, and power" },
  ];
  const categoryMap = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description },
      create: category,
    });
    categoryMap.set(row.slug, row.id);
  }

  const brands = [
    { name: "Sony", slug: "sony" },
    { name: "Bose", slug: "bose" },
    { name: "Apple", slug: "apple" },
    { name: "Samsung", slug: "samsung" },
    { name: "Framework", slug: "framework" },
    { name: "Google", slug: "google" },
    { name: "Logitech", slug: "logitech" },
    { name: "Anker", slug: "anker" },
    { name: "Keychron", slug: "keychron" },
    { name: "Philips", slug: "philips" },
    { name: "Nothing", slug: "nothing" },
  ];
  const brandMap = new Map<string, string>();
  for (const brand of brands) {
    const row = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name },
      create: brand,
    });
    brandMap.set(row.slug, row.id);
  }

  for (const [index, product] of products.entries()) {
    const imageName = placeProductImage(product.slug, product.name, product.color);
    const derived = await writeDerivedImages(uploadDir, imageName);
    const locator = locatorFromIndex(index);
    const row = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        price: product.price,
        wholesalePrice: wholesaleOf(product.price),
        vatRate: FINLAND_VAT_RATE,
        stockQuantity: product.stock,
        categoryId: categoryMap.get(product.category)!,
        brandId: brandMap.get(product.brand)!,
        weightKg: product.kg,
        weightLb: kgToLb(product.kg),
        lengthCm: product.l,
        widthCm: product.w,
        heightCm: product.h,
        lengthIn: cmToIn(product.l),
        widthIn: cmToIn(product.w),
        heightIn: cmToIn(product.h),
        averageRating: 0,
        reviewCount: 0,
        featured: Boolean(product.featured),
        wholesalerId: wholesalerIdForCategory(product.category, wholesalers),
        wholesaleSku: wholesaleSkuFromSlug(product.slug),
        barcode: ean13FromIndex(index),
        ...productInformation(product),
        ...locator,
      },
      create: {
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        wholesalePrice: wholesaleOf(product.price),
        vatRate: FINLAND_VAT_RATE,
        stockQuantity: product.stock,
        categoryId: categoryMap.get(product.category)!,
        brandId: brandMap.get(product.brand)!,
        weightKg: product.kg,
        weightLb: kgToLb(product.kg),
        lengthCm: product.l,
        widthCm: product.w,
        heightCm: product.h,
        lengthIn: cmToIn(product.l),
        widthIn: cmToIn(product.w),
        heightIn: cmToIn(product.h),
        averageRating: 0,
        reviewCount: 0,
        featured: Boolean(product.featured),
        wholesalerId: wholesalerIdForCategory(product.category, wholesalers),
        wholesaleSku: wholesaleSkuFromSlug(product.slug),
        barcode: ean13FromIndex(index),
        ...productInformation(product),
        ...locator,
      },
    });
    await prisma.productImage.deleteMany({ where: { productId: row.id } });
    await prisma.productImage.create({
      data: {
        productId: row.id,
        path: derived.full,
        thumbPath: derived.thumb,
        altText: `${product.name} product photo`,
        sortOrder: 0,
      },
    });
    await prisma.productAttribute.deleteMany({ where: { productId: row.id } });
    if (product.attributes.length) {
      await prisma.productAttribute.createMany({
        data: product.attributes.map((attribute) => ({
          productId: row.id,
          name: attribute.name,
          value: attribute.value,
        })),
      });
    }
  }
  await ensureSonyPromotion();

  const demoEmail = "customer@volt.test";
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      passwordHash: await argon2.hash("Shopping123"),
      emailVerifiedAt: new Date(),
      displayName: "Demo Customer",
      totpEnabled: false,
    },
    create: {
      email: demoEmail,
      displayName: "Demo Customer",
      passwordHash: await argon2.hash("Shopping123"),
      emailVerifiedAt: new Date(),
      totpEnabled: false,
      roleId: customerRole.id,
    },
  });
  await prisma.totpSecret.deleteMany({ where: { userId: demoUser.id } });
  await prisma.address.deleteMany({ where: { userId: demoUser.id } });
  await prisma.address.create({
    data: {
      userId: demoUser.id,
      label: "Home",
      isDefault: true,
      recipientNameEnc: encrypt("Demo Customer"),
      line1Enc: encrypt("Mannerheimintie 12"),
      cityEnc: encrypt("Helsinki"),
      postalEnc: encrypt("00100"),
      country: "FI",
      phoneEnc: encryptOptional("+358401234567"),
    },
  });

  await ensureStaffUser("admin@volt.test", "Volt Admin", adminRole.id);
  await ensureStaffUser("support@volt.test", "Volt Support", supportRole.id);
  await ensureStaffUser("sales@volt.test", "Volt Sales", salesRole.id);
  await ensureStaffUser("warehouse@volt.test", "Volt Warehouse", warehouseRole.id);

  await prisma.shippingOption.upsert({
    where: { code: "standard" },
    update: {
      name: "Standard",
      description: "3–5 business days",
      price: STANDARD_SHIPPING,
      freeThreshold: FREE_STANDARD_THRESHOLD,
      minDays: 3,
      maxDays: 5,
      active: true,
      sortOrder: 0,
    },
    create: {
      code: "standard",
      name: "Standard",
      description: "3–5 business days",
      price: STANDARD_SHIPPING,
      freeThreshold: FREE_STANDARD_THRESHOLD,
      minDays: 3,
      maxDays: 5,
      active: true,
      sortOrder: 0,
    },
  });
  await prisma.shippingOption.upsert({
    where: { code: "express" },
    update: {
      name: "Express",
      description: "1–2 business days",
      price: EXPRESS_SHIPPING,
      freeThreshold: null,
      minDays: 1,
      maxDays: 2,
      active: true,
      sortOrder: 1,
    },
    create: {
      code: "express",
      name: "Express",
      description: "1–2 business days",
      price: EXPRESS_SHIPPING,
      minDays: 1,
      maxDays: 2,
      active: true,
      sortOrder: 1,
    },
  });
  await ensurePackageSizes();

  const headphones = await prisma.product.findUnique({ where: { slug: "sony-wh-1000xm5" } });
  const bose = await prisma.product.findUnique({ where: { slug: "bose-quietcomfort-ultra" } });
  const airpods = await prisma.product.findUnique({ where: { slug: "apple-airpods-pro-2" } });
  if (headphones) {
    await prisma.order.deleteMany({
      where: { userId: demoUser.id, items: { some: { productId: headphones.id } } },
    });
    await prisma.order.create({
      data: {
        userId: demoUser.id,
        status: "DELIVERED",
        subtotal: headphones.price,
        shippingCost: 0,
        tax: 0,
        total: headphones.price,
        shippingMethod: "standard",
        contactEmailEnc: encrypt(demoEmail),
        contactNameEnc: encrypt("Demo Customer"),
        contactPhoneEnc: encryptOptional("+358401234567"),
        shippingAddressEnc: encryptJson({
          recipientName: "Demo Customer",
          line1: "Mannerheimintie 12",
          city: "Helsinki",
          postal: "00100",
          country: "FI",
          countryName: "Finland",
        }),
        items: {
          create: {
            productId: headphones.id,
            productName: headphones.name,
            quantity: 1,
            unitPrice: headphones.price,
            lineTotal: headphones.price,
            locatorCode: formatLocatorCode(
              headphones.locatorStation,
              headphones.locatorBlock,
              headphones.locatorShelf,
              headphones.locatorPlace,
            ),
          },
        },
        events: {
          create: [
            { status: "PAID", note: "Seeded demo purchase" },
            { status: "DELIVERED", note: "Delivered" },
          ],
        },
        payment: {
          create: {
            status: "SUCCEEDED",
            amount: headphones.price,
            currency: "EUR",
          },
        },
      },
    });
  }

  const passwordHash = await argon2.hash("Shopping123");
  const reviewers = [
    { email: "riku@volt.test", name: "Riku", stars: 5, product: headphones, body: "Best commute headphones I have owned. ANC is quiet enough for the tram." },
    { email: "aisha@volt.test", name: "Aisha", stars: 4, product: headphones, body: "Comfortable for long calls. The app takes a minute to learn but the sound is excellent." },
    { email: "leo@volt.test", name: "Leo", stars: 5, product: bose, body: "The spatial mode is a gimmick; the quiet is not. I take these on every flight." },
    { email: "nora@volt.test", name: "Nora", stars: 4, product: airpods, body: "They stay in during runs and the case is tiny. Battery lasts a full work day." },
  ];
  await prisma.review.deleteMany({
    where: { user: { email: { in: reviewers.map((row) => row.email) } } },
  });
  await prisma.order.deleteMany({
    where: { user: { email: { in: reviewers.map((row) => row.email) } } },
  });
  for (const reviewer of reviewers) {
    if (!reviewer.product) continue;
    const user = await prisma.user.upsert({
      where: { email: reviewer.email },
      update: { passwordHash, emailVerifiedAt: new Date(), displayName: reviewer.name, roleId: customerRole.id },
      create: {
        email: reviewer.email,
        displayName: reviewer.name,
        passwordHash,
        emailVerifiedAt: new Date(),
        roleId: customerRole.id,
      },
    });
    await prisma.order.create({
      data: {
        userId: user.id,
        status: "DELIVERED",
        subtotal: reviewer.product.price,
        shippingCost: 0,
        tax: 0,
        total: reviewer.product.price,
        shippingMethod: "standard",
        contactEmailEnc: encrypt(reviewer.email),
        contactNameEnc: encrypt(reviewer.name),
        shippingAddressEnc: encryptJson({
          recipientName: reviewer.name,
          line1: "Seed Street 1",
          city: "Helsinki",
          postal: "00100",
          country: "FI",
        }),
        items: {
          create: {
            productId: reviewer.product.id,
            productName: reviewer.product.name,
            quantity: 1,
            unitPrice: reviewer.product.price,
            lineTotal: reviewer.product.price,
            locatorCode: formatLocatorCode(
              reviewer.product.locatorStation,
              reviewer.product.locatorBlock,
              reviewer.product.locatorShelf,
              reviewer.product.locatorPlace,
            ),
          },
        },
        events: {
          create: [
            { status: "PAID", note: "Seeded reviewer purchase" },
            { status: "DELIVERED", note: "Delivered" },
          ],
        },
      },
    });
    await prisma.review.upsert({
      where: { productId_userId: { productId: reviewer.product.id, userId: user.id } },
      update: { stars: reviewer.stars, body: reviewer.body, status: "PUBLISHED" },
      create: {
        productId: reviewer.product.id,
        userId: user.id,
        stars: reviewer.stars,
        body: reviewer.body,
        helpfulCount: reviewer.stars === 5 ? 6 : 2,
      },
    });
  }

  for (const product of [headphones, bose, airpods]) {
    if (!product) continue;
    const published = await prisma.review.findMany({
      where: { productId: product.id, status: "PUBLISHED" },
    });
    const sum = published.reduce((total, row) => total + row.stars, 0);
    const count = published.length;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        averageRating: count ? Math.round((sum / count) * 10) / 10 : 0,
        reviewCount: count,
      },
    });
  }

  console.log(
    `Seeded ${products.length} products, demo ${demoEmail}, staff admin@volt.test (2FA secret ${DEMO_ADMIN_TOTP_SECRET})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
