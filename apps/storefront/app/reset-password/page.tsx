import { ResetForm } from "@/components/auth-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "New password — Volt & Co",
  "Choose a new password for your Volt & Co account using the reset link from email.",
);

export default function ResetPage() {
  return <ResetForm />;
}
