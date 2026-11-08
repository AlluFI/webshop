"use client";

import { linesFromText } from "@volt/shared";
import type { Product } from "@/lib/product";
import type { MessageKey } from "@/lib/i18n";
import { useI18n } from "./i18n";

const reservedSpecNames = new Set([
  "brand",
  "model",
  "color",
  "warranty",
  "energy class",
  "ean",
  "release year",
  "weight",
  "dimensions",
  "in the box",
]);

export function ProductFacts({ product }: { product: Product }) {
  const { t } = useI18n();
  const highlights = linesFromText(product.highlights);
  const box = linesFromText(product.packageContents);
  const period = product.warrantyMonths
    ? t(product.warrantyMonths === 1 ? "pdp.warrantyMonth" : "pdp.warrantyMonths", {
        n: product.warrantyMonths,
      })
    : "";
  const extra = product.warrantyNote?.trim() ?? "";
  const warranty = period && extra ? `${period} · ${extra}` : period || extra;
  const facts: [MessageKey | string, string][] = [
    ["pdp.fact.brand", product.brand.name],
    ["pdp.fact.model", product.modelCode ?? ""],
    ["pdp.fact.color", product.colorName ?? ""],
    ["pdp.fact.releaseYear", product.releaseYear ? String(product.releaseYear) : ""],
    ["pdp.fact.warranty", warranty],
    ["pdp.fact.energy", product.energyClass ?? ""],
    ["pdp.fact.ean", product.barcode ?? ""],
    ...(product.attributes ?? [])
      .filter((row) => !reservedSpecNames.has(row.name.toLowerCase()))
      .map((row): [string, string] => [row.name, row.value]),
    ["pdp.fact.box", box.join("\n")],
  ].filter((row): row is [MessageKey | string, string] => Boolean(row[1]));

  return (
    <>
      {highlights.length > 0 && (
        <ul className="pdp-highlights">
          {highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {warranty ? (
        <p className="pdp-warranty">
          <strong>{t("pdp.warranty")}</strong> {warranty}
        </p>
      ) : null}
      {product.manufacturerUrl || product.brandUrl ? (
        <p className="pdp-links">
          {product.manufacturerUrl ? (
            <a href={product.manufacturerUrl} target="_blank" rel="noreferrer">
              {t("pdp.manufacturer")}
            </a>
          ) : null}
          {product.brandUrl ? (
            <a href={product.brandUrl} target="_blank" rel="noreferrer">
              {t("pdp.brandSite", { name: product.brand.name })}
            </a>
          ) : null}
        </p>
      ) : null}
      {facts.length > 0 ? (
        <section className="product-facts">
          <h2>{t("pdp.productInfo")}</h2>
          <table>
            <tbody>
              {facts.map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{name.startsWith("pdp.") ? t(name as MessageKey) : name}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
