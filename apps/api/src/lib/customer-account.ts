import { bookkeepingRetainUntil, isMoneyMovingOrderStatus, isStaffRole } from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { tokens } from "../services/tokens.js";
import { emitIntegrationEvent } from "./integration-events.js";

const DELETED_MESSAGE = "This account has been deleted.";

export function rejectDeletedAccount(user: { deletedAt?: Date | null } | null | undefined) {
  if (user?.deletedAt) {
    throw new HttpError(401, DELETED_MESSAGE);
  }
}

export function orderNeedsRetention(order: {
  status: string;
  payment?: { status: string } | null;
}) {
  if (isMoneyMovingOrderStatus(order.status)) return true;
  const pay = order.payment?.status;
  return pay === "SUCCEEDED" || pay === "REFUNDED";
}

export async function requestCustomerDeletion(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      orders: { include: { payment: { select: { status: true } } } },
    },
  });
  if (!user) throw new HttpError(401, "Sign in to continue");
  if (isStaffRole(user.role.name)) {
    throw new HttpError(403, "Staff accounts cannot be deleted from Profile.");
  }
  if (user.deletedAt) {
    return {
      message: "This account is already deleted.",
      retained: Boolean(user.retainUntil),
      retainUntil: user.retainUntil?.toISOString() ?? null,
    };
  }

  const moneyOrders = user.orders.filter(orderNeedsRetention);
  const lastMoney = moneyOrders.reduce<Date | null>((latest, order) => {
    if (!latest || order.createdAt > latest) return order.createdAt;
    return latest;
  }, null);
  const retainUntil = lastMoney ? bookkeepingRetainUntil(lastMoney) : null;

  await prisma.$transaction(async (tx) => {
    await tx.address.deleteMany({ where: { userId } });
    await tx.cart.deleteMany({ where: { userId } });
    await tx.oAuthIdentity.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.totpSecret.deleteMany({ where: { userId } });
    await tx.reviewVote.deleteMany({ where: { userId } });
    await tx.review.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        displayName: null,
        passwordHash: null,
        email: `deleted+${userId}@invalid.local`,
        emailVerifiedAt: null,
        totpEnabled: false,
        marketingOptIn: false,
        deletedAt: new Date(),
        retainUntil,
      },
    });
  });
  await tokens.revokeAll(userId);
  void emitIntegrationEvent("customer.deleted", {
    id: userId,
    retained: Boolean(retainUntil),
    retainUntil: retainUntil?.toISOString() ?? null,
  }).catch(() => undefined);

  return {
    message: retainUntil
      ? "Your account is closed. Order records are kept for Finnish bookkeeping until the retain-until date."
      : "Your account and personal data have been deleted.",
    retained: Boolean(retainUntil),
    retainUntil: retainUntil?.toISOString() ?? null,
  };
}
