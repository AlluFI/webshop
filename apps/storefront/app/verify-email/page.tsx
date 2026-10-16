import { VerifyForm } from "@/components/auth-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Verify email — Volt & Co",
  "Confirm your Volt & Co email address so you can sign in and place orders.",
);

export default function VerifyPage() {
  return <VerifyForm />;
}
