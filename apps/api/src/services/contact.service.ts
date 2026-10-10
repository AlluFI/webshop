import { contactSchema } from "@volt/shared";
import { mail } from "../mail.js";
import { verifyCaptcha } from "../lib/captcha.js";

export const contactService = {
  async submit(input: unknown) {
    const dto = contactSchema.parse(input);
    await verifyCaptcha(dto.captchaToken);
    await mail.sendContact({
      name: dto.name,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
    });
    return { message: "Thanks — we received your message and will reply by email." };
  },
};
