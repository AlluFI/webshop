import nodemailer from "nodemailer";
import { config } from "./config.js";
import { buildOrderPaidEmail, buildOrderShippedEmail, type OrderEmailDetails, type OrderShippedEmailDetails } from "./lib/order-email.js";
import { buildRestockEmail, type RestockEmailDetails } from "./lib/restock-email.js";

const transporter = nodemailer.createTransport({
  host: config.mailHost,
  port: config.mailPort,
  secure: config.mailPort === 465,
});

async function send(to: string, subject: string, text: string, html?: string) {
  try {
    await transporter.sendMail({ from: config.mailFrom, to, subject, text, html });
  } catch (error) {
    console.warn("[mail] send failed; logging instead", error);
    console.info(`[mail] To: ${to}\n${subject}\n${text}`);
  }
}

export const mail = {
  async sendVerification(to: string, token: string) {
    const link = `${config.webAppUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
    await send(
      to,
      "Verify your Volt & Co email",
      `Welcome to Volt & Co.\n\nConfirm your email by opening this link (valid 48 hours):\n${link}\n`,
    );
  },

  async sendPasswordReset(to: string, token: string) {
    const link = `${config.webAppUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    await send(
      to,
      "Reset your Volt & Co password",
      `Reset your password using this link (valid 1 hour):\n${link}\n\nIf you signed in with Google, this lets you add an email-and-password sign-in as well.\n\nIf you did not request this, you can ignore this email.\n`,
    );
  },

  async sendOrderPaid(details: OrderEmailDetails) {
    const built = buildOrderPaidEmail(details);
    await send(details.email, built.subject, built.text, built.html);
  },

  async sendOrderShipped(details: OrderShippedEmailDetails) {
    const built = buildOrderShippedEmail(details);
    await send(details.email, built.subject, built.text, built.html);
  },

  async sendPaymentFailed(details: OrderEmailDetails) {
    const built = buildOrderPaidEmail(details);
    await send(details.email, built.subject, built.text, built.html);
  },

  async sendRestockOrder(details: RestockEmailDetails) {
    const built = buildRestockEmail(details);
    await send(details.wholesalerEmail, built.subject, built.text, built.html);
  },

  async sendContact(input: { name: string; email: string; subject: string; message: string }) {
    await send(
      "support@localhost",
      `Contact: ${input.subject}`,
      `From: ${input.name} <${input.email}>\n\n${input.message}\n`,
    );
  },
};
