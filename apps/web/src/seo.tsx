import { useEffect } from "react";

const TITLE_MAX = 60;
const META_MIN = 155;
const META_MAX = 160;
const META_PAD =
  " Volt & Co is a Helsinki electronics shop with honest stock, purchased-only reviews, and Stripe sandbox checkout.";

export function fitPageTitle(title: string) {
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

export function fitMetaDescription(description: string) {
  let text = description.replace(/\s+/g, " ").trim();
  if (text.length > META_MAX) return `${text.slice(0, META_MAX - 1)}…`;
  if (text.length >= META_MIN) return text;
  text = `${text}${text.endsWith(".") ? "" : "."}${META_PAD}`;
  if (text.length < META_MIN) text = `${text} Shop headphones, laptops, phones, and home tech.`;
  return text.length > META_MAX ? text.slice(0, META_MAX) : text;
}

export function PageMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = fitPageTitle(title);
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", fitMetaDescription(description));
  }, [title, description]);
  return null;
}
