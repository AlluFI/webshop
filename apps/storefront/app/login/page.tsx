import { LoginForm } from "@/components/auth-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Sign in — Volt & Co",
  "Sign in to Volt & Co to manage orders, addresses, and reviews. Staff accounts require two-factor authentication.",
);

export default function LoginPage() {
  return <LoginForm />;
}
