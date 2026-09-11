import { z } from "zod";

export const STORE_CURRENCY = "EUR";
export const STANDARD_SHIPPING = 8;
export const EXPRESS_SHIPPING = 18;
export const FREE_STANDARD_THRESHOLD = 150;

export const addCartItemSchema = z.object({
  productId: z.string().uuid("Choose a product"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(99, "Quantity is too high"),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0, "Quantity cannot be negative").max(99, "Quantity is too high"),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
