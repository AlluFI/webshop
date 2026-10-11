import {
  CHECKOUT_COUNTRIES,
  checkoutQuoteSchema,
  checkoutValidateSchema,
  vatIncludedLabel,
  type AddressInput,
  type ShippingMethod,
} from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";
import { orderTotal, taxAmount } from "../lib/cart-math.js";
import { cartService, type CartContext } from "./cart.service.js";
import { addressService } from "./address.service.js";
import { shippingService } from "./shipping.service.js";

function countryName(code: string) {
  return CHECKOUT_COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

async function resolveAddress(userId: string | undefined, input: {
  addressId?: string;
  address?: AddressInput;
}) {
  if (input.addressId) {
    if (!userId) throw new HttpError(401, "Sign in to use a saved address");
    return addressService.get(userId, input.addressId);
  }
  if (input.address) return input.address;
  return null;
}

async function quoteFromCart(
  cart: Awaited<ReturnType<typeof cartService.get>>["dto"],
  method: ShippingMethod,
) {
  if (cart.items.length === 0) {
    throw new HttpError(400, "Your cart is empty.", { cart: "Add an item before checkout." });
  }
  const quoted = await shippingService.quote(method, cart.subtotal);
  const tax = taxAmount(cart.subtotal, quoted.cost);
  return {
    items: cart.items,
    itemCount: cart.itemCount,
    subtotal: cart.subtotal,
    shippingMethod: method,
    shippingCost: quoted.cost,
    shippingLabel: quoted.label,
    tax,
    taxLabel: vatIncludedLabel(),
    total: orderTotal(cart.subtotal, quoted.cost, tax),
    warnings: cart.warnings,
  };
}

export const checkoutService = {
  async prefill(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new HttpError(401, "Sign in to continue");
    const addresses = await addressService.list(userId);
    const defaultAddress = addresses.items.find((item) => item.isDefault) ?? addresses.items[0] ?? null;
    return {
      email: user.email,
      displayName: user.displayName || "",
      phone: defaultAddress?.phone || "",
      addresses: addresses.items,
      defaultAddress,
    };
  },

  async quote(ctx: CartContext, input: unknown) {
    const dto = checkoutQuoteSchema.parse(input);
    const cart = await cartService.get(ctx);
    const summary = await quoteFromCart(cart.dto, dto.shippingMethod);
    const address = await resolveAddress(ctx.userId, dto);
    return {
      ...summary,
      cookie: cart.cookie,
      email: dto.email ?? null,
      displayName: dto.displayName ?? null,
      phone: dto.phone ?? null,
      address: address
        ? { ...address, countryName: countryName(address.country) }
        : null,
    };
  },

  async validate(ctx: CartContext, input: unknown) {
    const dto = checkoutValidateSchema.parse(input);
    const cart = await cartService.get(ctx);
    const summary = await quoteFromCart(cart.dto, dto.shippingMethod);
    let address = await resolveAddress(ctx.userId, dto);
    if (!address) {
      throw new HttpError(400, "Shipping address is required", {
        address: "Shipping address is required",
      });
    }
    if (ctx.userId && dto.saveAddress && dto.address) {
      address = await addressService.create(ctx.userId, {
        ...dto.address,
        phone: dto.address.phone || dto.phone,
        isDefault: true,
      });
    }
    return {
      ready: true as const,
      message: "Order details look good. Payment with Stripe is next.",
      cookie: cart.cookie,
      email: dto.email,
      displayName: dto.displayName,
      phone: dto.phone,
      address: { ...address, countryName: countryName(address.country) },
      ...summary,
    };
  },
};
