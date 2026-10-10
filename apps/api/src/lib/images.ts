import path from "node:path";
import { extname } from "node:path";
import { copyFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const FULL_SIZE = 1200;
const THUMB_SIZE = 400;

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
