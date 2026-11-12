"use client";

import { formatStoreDateTime } from "@volt/shared";
import { money, type Product, type PromotionPeriod } from "@/lib/product";
import { Modal } from "./admin/Modal";
import { useI18n } from "./i18n";

export function ProductPrice({ product, showNote = true }: { product: Product; showNote?: boolean }) {
  const { t } = useI18n();
  const selling = product.sellingPrice ?? product.price;
  const onPromo = Boolean(product.onPromotion);

  return (
    <div className="price-block">
      {onPromo ? (
        <>
          <p className="price price-now">{money(selling)}</p>
          <p className="price-was">{money(product.price)}</p>
        </>
      ) : (
        <p className="price">{money(selling)}</p>
      )}
      {showNote && onPromo && product.lowestPrice30d != null ? (
        <p className="price-note">
          {t("price.lowest30d", { amount: money(product.lowestPrice30d) })}
        </p>
      ) : null}
    </div>
  );
}

export function PromotionHistoryModal({
  open,
  title,
  periods,
  onClose,
}: {
  open: boolean;
  title: string;
  periods: PromotionPeriod[];
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={`${title} promotion history`} onClose={onClose} wide>
      {periods.length ? (
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Regular</th>
              <th scope="col">Promotion</th>
              <th scope="col">Lowest before</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((row) => (
              <tr key={row.id}>
                <td>
                  {formatStoreDateTime(row.startsAt)} – {formatStoreDateTime(row.endsAt)}
                </td>
                <td className="num">{money(row.regularPrice)}</td>
                <td className="num">{money(row.promoPrice)}</td>
                <td className="num">{money(row.lowestPriceBeforePromo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No promotion periods yet.</p>
      )}
    </Modal>
  );
}
