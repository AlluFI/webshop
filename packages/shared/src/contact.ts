import { z } from "zod";
import { emailSchema } from "./auth.js";

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  email: emailSchema,
  subject: z.string().trim().min(3, "Subject is required").max(120, "Subject is too long"),
  message: z.string().trim().min(10, "Write at least 10 characters").max(4000, "Message is too long"),
  captchaToken: z.string().min(1, "Complete the CAPTCHA"),
});

export type ContactInput = z.infer<typeof contactSchema>;
