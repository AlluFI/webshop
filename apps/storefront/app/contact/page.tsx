import { ContactForm } from "@/components/contact-form";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("contact.title")} — Volt & Co`, t("contact.lead"));
}

export default function ContactPage() {
  return <ContactForm />;
}
