import { ReviewsPage } from "@/components/reviews-page";
import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("review.title")} — Volt & Co`, t("review.lead"));
}

export default function ReviewsRoute() {
  return <ReviewsPage />;
}
