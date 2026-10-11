import path from "node:path";
import { extname } from "node:path";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const FULL_SIZE = 1200;
const THUMB_SIZE = 400;
const PLACEHOLDER_COLORS = ["#1f3a5f", "#3d3a36", "#4a2c0a", "#2c4a3a", "#5a1f2e", "#2a3f4a"];

function variantName(filename: string, suffix: string) {
  const ext = extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  return `${base}${suffix}${ext || ".jpg"}`;
}

export function isRasterImage(filename: string) {
  return /\.(jpe?g|png|webp|gif)$/i.test(filename);
}

export async function writeDerivedImages(uploadDir: string, filename: string) {
  const source = path.join(uploadDir, filename);
  if (!isRasterImage(filename)) {
    return { full: filename, thumb: filename };
  }
  const fullName = variantName(filename, "-full");
  const thumbName = variantName(filename, "-thumb");
  try {
    const image = sharp(source).rotate();
    await image
      .clone()
      .resize(FULL_SIZE, FULL_SIZE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toFile(path.join(uploadDir, fullName));
    await image
      .clone()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toFile(path.join(uploadDir, thumbName));
    return { full: fullName, thumb: thumbName };
  } catch {
    await copyFile(source, path.join(uploadDir, fullName)).catch(() => undefined);
    return { full: filename, thumb: filename };
  }
}

export async function saveUpload(uploadDir: string, originalName: string, buffer: Buffer) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
  const ext = extname(safe) || ".jpg";
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stored = `${base}${ext}`;
  await writeFile(path.join(uploadDir, stored), buffer);
  const derived = await writeDerivedImages(uploadDir, stored);
  return { original: stored, ...derived };
}

export function fileUrl(name: string | null | undefined) {
  if (!name) return null;
  return `/api/v1/files/${name}`;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export function colorForSlug(slug: string) {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length];
}

export async function writePlaceholderImage(uploadDir: string, slug: string, label: string) {
  await mkdir(uploadDir, { recursive: true });
  const filename = `${slug}.svg`;
  const color = colorForSlug(slug);
  const lines = wrapLabel(label, 22);
  const fontSize = lines.length > 2 ? 34 : 42;
  const lineHeight = fontSize + 10;
  const startY = 390 - ((lines.length - 1) * lineHeight) / 2;
  const title = lines
    .map(
      (line, index) =>
        `<text x="400" y="${startY + index * lineHeight}" text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}" fill="#f7f4ec">${escapeXml(line)}</text>`,
    )
    .join("\n  ");
  const brandY = startY + lines.length * lineHeight + 8;
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${escapeXml(label)}">
  <rect width="800" height="800" fill="#f3efe6"/>
  <rect x="80" y="80" width="640" height="640" rx="36" fill="${color}"/>
  ${title}
  <text x="400" y="${brandY}" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#d9d0bc">Volt &amp; Co</text>
</svg>`;
  await writeFile(path.join(uploadDir, filename), content);
  return filename;
}
