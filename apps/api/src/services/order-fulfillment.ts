import { Prisma } from "@prisma/client";
import type { PaymentStatusMessage } from "@volt/shared";
import { prisma } from "../prisma.js";
import { encryptJson, decrypt, decryptJson } from "../lib/crypto.js";
import { mail } from "../mail.js";

export type PaymentMeta = {
  guestAccessHash: string;
  cartId?: string;
  lastError?: string;
};

function moneyNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

export async function releaseReservations(tx: Prisma.TransactionClient, orderId: string) {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, releasedAt: null },
  });
  for (const reservation of reservations) {
    await tx.product.update({
      where: { id: reservation.productId },
      data: { stockQuantity: { increment: reservation.quantity } },
    });
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { releasedAt: new Date() },
    });
  }
}

export async function restoreCartFromOrder(
  tx: Prisma.TransactionClient,
  order: { userId: string | null; items: { productId: string; quantity: number }[] },
  cartId: string | undefined,
) {
  let id = cartId;
  if (!id && order.userId) {
    const existing = await tx.cart.findUnique({ where: { userId: order.userId } });
    id = existing?.id;
    if (!id) {
      const created = await tx.cart.create({ data: { userId: order.userId } });
      id = created.id;
    }
  }
  if (!id) return;
  for (const item of order.items) {
    const row = await tx.cartItem.findUnique({
      where: { cartId_productId: { cartId: id, productId: item.productId } },
    });
    if (row) {
      await tx.cartItem.update({
        where: { id: row.id },
        data: { quantity: row.quantity + item.quantity },
      });
    } else {
      await tx.cartItem.create({
        data: { cartId: id, productId: item.productId, quantity: item.quantity },
      });
    }
  }
}

export async function handlePaymentStatus(message: PaymentStatusMessage) {
  const payment = await prisma.payment.findUnique({
    where: { orderId: message.orderId },
    include: { order: { include: { items: true } } },
  });
  if (!payment) return { ignored: true as const };

  if (message.outcome === "succeeded") {
    if (payment.status === "SUCCEEDED" || payment.order.status === "PAID") {
      return { ignored: true as const };
    }
    if (payment.order.status === "CANCELLED" || payment.order.status === "REFUNDED") {
      return { ignored: true as const };
    }
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          stripePaymentIntentId: message.paymentIntentId ?? payment.stripePaymentIntentId,
        },
      }),
      prisma.order.update({
        where: { id: payment.orderId },
        data: { status: "PAID" },
      }),
      prisma.orderStatusEvent.create({
        data: { orderId: payment.orderId, status: "PAID", note: "Stripe confirmed the payment." },
      }),
    ]);
    await mail.sendOrderPaid(
      decrypt(payment.order.contactEmailEnc),
      payment.orderId,
      `${payment.order.currency} ${moneyNumber(payment.order.total).toFixed(2)}`,
    );
    return { status: "PAID" as const };
  }

  if (message.outcome === "processing") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PROCESSING",
        stripePaymentIntentId: message.paymentIntentId ?? payment.stripePaymentIntentId,
      },
    });
    return { status: "PROCESSING" as const };
  }

  if (payment.status === "SUCCEEDED" || payment.order.status === "PAID") {
    return { ignored: true as const };
  }
  if (payment.order.status === "CANCELLED" || payment.order.status === "REFUNDED") {
    return { ignored: true as const };
  }
  if (payment.status === "FAILED" && payment.order.status === "PAYMENT_FAILED") {
    return { ignored: true as const };
  }

  const reason = message.reason || "The card was declined.";
  const meta: PaymentMeta = payment.metadataEnc
    ? decryptJson<PaymentMeta>(payment.metadataEnc)
    : { guestAccessHash: "" };

  await prisma.$transaction(async (tx) => {
    await releaseReservations(tx, message.orderId);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        stripePaymentIntentId: message.paymentIntentId ?? payment.stripePaymentIntentId,
        metadataEnc: encryptJson({ ...meta, lastError: reason }),
      },
    });
    await tx.order.update({
      where: { id: message.orderId },
      data: { status: "PAYMENT_FAILED" },
    });
    await tx.orderStatusEvent.create({
      data: { orderId: message.orderId, status: "PAYMENT_FAILED", note: reason },
    });
    await restoreCartFromOrder(tx, payment.order, meta.cartId);
  });

  await mail.sendPaymentFailed(decrypt(payment.order.contactEmailEnc), message.orderId, reason);
  return { status: "PAYMENT_FAILED" as const };
}
