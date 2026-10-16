import { ForgotForm } from "@/components/auth-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Reset password — Volt & Co",
  "Request a Volt & Co password reset link. We email it to Mailpit in this sandbox environment.",
);

export default function ForgotPage() {
  return <ForgotForm />;
}
