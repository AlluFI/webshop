export const POSTI_PACKAGE_SIZES = [
  { code: "S", name: "Posti S", lengthCm: 25, widthCm: 17.5, heightCm: 8, maxWeightKg: 2, sortOrder: 10 },
  { code: "M", name: "Posti M", lengthCm: 35, widthCm: 25, heightCm: 10, maxWeightKg: 5, sortOrder: 20 },
  { code: "L", name: "Posti L", lengthCm: 40, widthCm: 30, heightCm: 20, maxWeightKg: 10, sortOrder: 30 },
  { code: "XL", name: "Posti XL", lengthCm: 50, widthCm: 35, heightCm: 25, maxWeightKg: 20, sortOrder: 40 },
  { code: "XXL", name: "Posti XXL", lengthCm: 60, widthCm: 40, heightCm: 40, maxWeightKg: 30, sortOrder: 50 },
] as const;

export const PACKAGE_SUPPLIER_EMAIL = "posti.pakkaus@localhost";
export const PACKAGE_SUPPLIER_NAME = "Posti Pakkaus";

export type PackageCandidate = {
  code: string;
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  maxWeightKg: number;
  stockQuantity: number;
};

export type PackableItem = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  quantity: number;
};

export type PackageRecommendation = {
  code: string | null;
  name: string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  maxWeightKg?: number;
  boxCount: number;
  stockQuantity?: number;
  stockLow: boolean;
  note: string;
};

const PACKING_FACTOR = 1.15;

export function boxVolumeCm(lengthCm: number, widthCm: number, heightCm: number) {
  return lengthCm * widthCm * heightCm;
}

function itemFitsBox(item: PackableItem, box: PackageCandidate) {
  const sides = [item.lengthCm, item.widthCm, item.heightCm];
  const orientations: [number, number, number][] = [
    [sides[0], sides[1], sides[2]],
    [sides[0], sides[2], sides[1]],
    [sides[1], sides[0], sides[2]],
    [sides[1], sides[2], sides[0]],
    [sides[2], sides[0], sides[1]],
    [sides[2], sides[1], sides[0]],
  ];
  return orientations.some(
    ([lengthCm, widthCm, heightCm]) =>
      lengthCm <= box.lengthCm && widthCm <= box.widthCm && heightCm <= box.heightCm,
  );
}

function formatBox(box: Pick<PackageCandidate, "name" | "lengthCm" | "widthCm" | "heightCm">) {
  return `${box.name} (${box.lengthCm} × ${box.widthCm} × ${box.heightCm} cm)`;
}

export function recommendPackage(items: PackableItem[], boxes: PackageCandidate[]): PackageRecommendation {
  const units = items.flatMap((item) => Array.from({ length: Math.max(0, item.quantity) }, () => item));
  if (!units.length || !boxes.length) {
    return {
      code: null,
      name: "Custom packaging",
      boxCount: 1,
      stockLow: false,
      note: "No product dimensions or package sizes are available. Use custom packaging.",
    };
  }

  const totalWeight = items.reduce((sum, item) => sum + item.weightKg * item.quantity, 0);
  const totalVolume = units.reduce(
    (sum, item) => sum + boxVolumeCm(item.lengthCm, item.widthCm, item.heightCm),
    0,
  );
  const ranked = [...boxes].sort(
    (left, right) =>
      boxVolumeCm(left.lengthCm, left.widthCm, left.heightCm) -
      boxVolumeCm(right.lengthCm, right.widthCm, right.heightCm),
  );

  for (const box of ranked) {
    if (totalWeight > box.maxWeightKg + 1e-6) continue;
    if (units.some((unit) => !itemFitsBox(unit, box))) continue;
    if (totalVolume * PACKING_FACTOR > boxVolumeCm(box.lengthCm, box.widthCm, box.heightCm) + 1e-6) {
      continue;
    }
    const stockLow = box.stockQuantity < 1;
    return {
      code: box.code,
      name: box.name,
      lengthCm: box.lengthCm,
      widthCm: box.widthCm,
      heightCm: box.heightCm,
      maxWeightKg: box.maxWeightKg,
      boxCount: 1,
      stockQuantity: box.stockQuantity,
      stockLow,
      note: stockLow
        ? `Use one ${formatBox(box)}. Stock is empty — order more from Packages.`
        : `Use one ${formatBox(box)}. Smallest standard Posti box that fits.`,
    };
  }

  const largest = ranked.at(-1);
  if (largest && units.every((unit) => itemFitsBox(unit, largest))) {
    const byVolume = Math.ceil(
      (totalVolume * PACKING_FACTOR) / boxVolumeCm(largest.lengthCm, largest.widthCm, largest.heightCm),
    );
    const byWeight = Math.ceil(totalWeight / largest.maxWeightKg);
    const boxCount = Math.max(2, byVolume, byWeight);
    return {
      code: largest.code,
      name: largest.name,
      lengthCm: largest.lengthCm,
      widthCm: largest.widthCm,
      heightCm: largest.heightCm,
      maxWeightKg: largest.maxWeightKg,
      boxCount,
      stockQuantity: largest.stockQuantity,
      stockLow: largest.stockQuantity < boxCount,
      note: `Use ${boxCount} × ${formatBox(largest)}. One box is too small for the combined volume or weight.`,
    };
  }

  return {
    code: null,
    name: "Custom packaging",
    boxCount: 1,
    stockLow: false,
    note: "No standard Posti box fits every item. Use custom packaging.",
  };
}
