import { ContactForm } from "@/components/contact-form";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "Contact — Volt & Co",
  "Write to Volt & Co support. Messages land in Mailpit during local Docker reviews.",
);

export default function ContactPage() {
  return <ContactForm />;
}
