import { RegisterForm } from "@/components/auth-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Register — Volt & Co",
  "Create a Volt & Co account to save addresses, track orders, and leave reviews on products you bought.",
);

export default function RegisterPage() {
  return <RegisterForm />;
}
