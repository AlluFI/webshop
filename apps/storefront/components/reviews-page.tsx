"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isStaffRole } from "@volt/shared";
import { api } from "@/lib/api";
import { AccountNav } from "./account-nav";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";
import { ReviewForm } from "./reviews";

type Pending = {
  productId: string;
  slug: string;
  name: string;
  orderId: string;
  thumbnail: string | null;
};

function ReviewsPageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, user, ready } = useAuth();
  const [items, setItems] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const staff = Boolean(user && isStaffRole(user.role));
  const focusSlug = searchParams.get("product");
  const orderId = searchParams.get("order");

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!accessToken || staff) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const pending = await api<{ items: Pending[] }>("/reviews/pending", { token: accessToken }).catch(
          () => ({ items: [] as Pending[] }),
        );
        const bySlug = new Map(pending.items.map((item) => [item.slug, item]));
        if (orderId) {
          const order = await api<{
            items: { id: string; name: string; slug: string; canReview?: boolean }[];
          }>(`/checkout/orders/${orderId}`, { token: accessToken }).catch(() => null);
          for (const item of order?.items ?? []) {
            if (!item.canReview || bySlug.has(item.slug)) continue;
            bySlug.set(item.slug, {
              productId: item.id,
              slug: item.slug,
              name: item.name,
              orderId,
              thumbnail: null,
            });
          }
        }
        if (!cancelled) setItems([...bySlug.values()]);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, orderId, staff]);

  const visible = useMemo(() => {
    if (!focusSlug) return items;
    const match = items.find((item) => item.slug === focusSlug);
    if (!match) return items;
    return [match, ...items.filter((item) => item.slug !== focusSlug)];
  }, [focusSlug, items]);

  useEffect(() => {
    if (!focusSlug || loading) return;
    document.getElementById(`review-${focusSlug}`)?.scrollIntoView({ block: "start" });
  }, [focusSlug, loading, visible]);

  if (!ready || !user) return <p>{t("account.loading")}</p>;

  return (
    <section>
      <AccountNav />
      <h1>{t("review.title")}</h1>
      {staff ? (
        <p className="muted">{t("review.staffHint")}</p>
      ) : (
        <>
          <p className="muted">{t("review.lead")}</p>
          {loading ? (
            <p>{t("common.loading")}</p>
          ) : visible.length === 0 ? (
            <p>{t("review.pendingEmpty")}</p>
          ) : (
            <div className="review-forms">
              {visible.map((item) => (
                <div key={item.productId} id={`review-${item.slug}`}>
                  <ReviewForm
                    slug={item.slug}
                    heading={t("order.review", { name: item.name })}
                    token={accessToken!}
                    onPublished={() => setItems((current) => current.filter((row) => row.productId !== item.productId))}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function ReviewsPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<p>{t("common.loading")}</p>}>
      <ReviewsPageInner />
    </Suspense>
  );
}
