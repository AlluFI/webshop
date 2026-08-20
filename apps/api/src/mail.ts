import nodemailer from "nodemailer";
import { config } from "./config.js";

const transporter = nodemailer.createTransport({
  host: config.mailHost,
  port: config.mailPort,
  secure: config.mailPort === 465,
});

async function send(to: string, subject: string, text: string) {
  try {
    await transporter.sendMail({ from: config.mailFrom, to, subject, text });
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
      `Reset your password using this link (valid 1 hour):\n${link}\n\nIf you did not request this, you can ignore this email.\n`,
    );
  },
};
