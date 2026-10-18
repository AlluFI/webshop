import { formatWarrantyLabel, linesFromText } from "@volt/shared";
import type { Product } from "./product";

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
  const highlights = linesFromText(product.highlights);
  const box = linesFromText(product.packageContents);
  const warranty = formatWarrantyLabel(product.warrantyMonths, product.warrantyNote);
  const facts: [string, string][] = [
    ["Brand", product.brand.name],
    ["Model", product.modelCode ?? ""],
    ["Color", product.colorName ?? ""],
    ["Release year", product.releaseYear ? String(product.releaseYear) : ""],
    ["Warranty", warranty],
    ["Energy class", product.energyClass ?? ""],
    ["EAN", product.barcode ?? ""],
    ...(product.attributes ?? [])
      .filter((row) => !reservedSpecNames.has(row.name.toLowerCase()))
      .map((row): [string, string] => [row.name, row.value]),
    ["In the box", box.join("\n")],
  ].filter((row): row is [string, string] => Boolean(row[1]));

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
          <strong>Warranty:</strong> {warranty}
        </p>
      ) : null}
      {product.manufacturerUrl || product.brandUrl ? (
        <p className="pdp-links">
          {product.manufacturerUrl ? (
            <a href={product.manufacturerUrl} target="_blank" rel="noreferrer">
              View on manufacturer site
            </a>
          ) : null}
          {product.brandUrl ? (
            <a href={product.brandUrl} target="_blank" rel="noreferrer">
              {product.brand.name} website
            </a>
          ) : null}
        </p>
      ) : null}
      {facts.length > 0 ? (
        <section className="product-facts">
          <h2>Product information</h2>
          <table>
            <tbody>
              {facts.map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
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
