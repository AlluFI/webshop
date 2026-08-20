import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();
const uploadDir = process.env.UPLOAD_DIR ?? "uploads";

function kgToLb(kg: number) {
  return Number((kg * 2.20462).toFixed(3));
}

function cmToIn(cm: number) {
  return Number((cm / 2.54).toFixed(2));
}

function svg(name: string, color: string, label: string) {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800" role="img" aria-label="${label}">
  <rect width="800" height="800" fill="#f3efe6"/>
  <rect x="80" y="80" width="640" height="640" rx="36" fill="${color}"/>
  <text x="400" y="390" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#f7f4ec">${escapeXml(label)}</text>
  <text x="400" y="450" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#d9d0bc">Volt &amp; Co</text>
</svg>`;
  mkdirSync(uploadDir, { recursive: true });
  writeFileSync(path.join(uploadDir, name), content);
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

type SeedProduct = {
  name: string;
  slug: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  brand: string;
  kg: number;
  l: number;
  w: number;
  h: number;
  color: string;
  featured?: boolean;
  rating: number;
  attributes: { name: string; value: string }[];
};

const products: SeedProduct[] = [
  {
    name: "Sony WH-1000XM5",
    slug: "sony-wh-1000xm5",
    description:
      "Industry-leading noise cancellation, 30-hour battery, and a plush over-ear fit for long listening sessions.",
    price: 349.99,
    stock: 24,
    category: "audio",
    brand: "sony",
    kg: 0.25,
    l: 19.5,
    w: 16.5,
    h: 8.0,
    color: "#1f3a5f",
    featured: true,
    rating: 4.7,
    attributes: [
      { name: "color", value: "Black" },
      { name: "wireless", value: "Yes" },
    ],
  },
  {
    name: "Bose QuietComfort Ultra",
    slug: "bose-quietcomfort-ultra",
    description:
      "Immersive audio with spatial modes and Bose's signature quiet, designed for travel and deep focus.",
    price: 429.0,
    stock: 18,
    category: "audio",
    brand: "bose",
    kg: 0.25,
    l: 19.6,
    w: 17.0,
    h: 7.6,
    color: "#3d3a36",
    featured: true,
    rating: 4.6,
    attributes: [
      { name: "color", value: "Black" },
      { name: "wireless", value: "Yes" },
    ],
  },
  {
    name: "Apple AirPods Pro (2nd generation)",
    slug: "apple-airpods-pro-2",
    description:
      "In-ear ANC earbuds with Adaptive Audio, MagSafe charging case, and seamless pairing across Apple devices.",
    price: 249.0,
    stock: 40,
    category: "audio",
    brand: "apple",
    kg: 0.056,
    l: 6.1,
    w: 4.6,
    h: 2.2,
    color: "#6e7c7a",
    rating: 4.8,
    attributes: [
      { name: "color", value: "White" },
      { name: "wireless", value: "Yes" },
    ],
  },
  {
    name: "Framework Laptop 13 DIY Edition",
    slug: "framework-laptop-13",
    description:
      "A repairable 13.5-inch laptop with swappable ports, upgradeable RAM and storage, and a matte 3:2 display.",
    price: 1099.0,
    stock: 12,
    category: "computers",
    brand: "framework",
    kg: 1.3,
    l: 29.7,
    w: 22.8,
    h: 1.58,
    color: "#2c4a3e",
    featured: true,
    rating: 4.5,
    attributes: [
      { name: "screen", value: "13.5 inch" },
      { name: "storage", value: "512 GB" },
    ],
  },
  {
    name: "Apple MacBook Air 15-inch (M3)",
    slug: "macbook-air-15-m3",
    description:
      "Fanless 15-inch notebook with the M3 chip, Liquid Retina display, and all-day battery for work and media.",
    price: 1299.0,
    stock: 9,
    category: "computers",
    brand: "apple",
    kg: 1.51,
    l: 34.04,
    w: 23.76,
    h: 1.15,
    color: "#5a6b7a",
    featured: true,
    rating: 4.8,
    attributes: [
      { name: "screen", value: "15.3 inch" },
      { name: "storage", value: "256 GB" },
    ],
  },
  {
    name: "Samsung Galaxy S24",
    slug: "samsung-galaxy-s24",
    description:
      "Compact flagship Android phone with a bright AMOLED panel, triple camera, and seven years of OS updates.",
    price: 799.0,
    stock: 22,
    category: "phones",
    brand: "samsung",
    kg: 0.167,
    l: 14.7,
    w: 7.06,
    h: 0.76,
    color: "#3b4d63",
    rating: 4.4,
    attributes: [
      { name: "color", value: "Onyx Black" },
      { name: "storage", value: "128 GB" },
    ],
  },
  {
    name: "Google Pixel 8",
    slug: "google-pixel-8",
    description:
      "Google's computational photography in a compact body, with seven years of updates and a smooth 120 Hz display.",
    price: 699.0,
    stock: 15,
    category: "phones",
    brand: "google",
    kg: 0.187,
    l: 15.05,
    w: 7.08,
    h: 0.89,
    color: "#6a5340",
    rating: 4.5,
    attributes: [
      { name: "color", value: "Hazel" },
      { name: "storage", value: "128 GB" },
    ],
  },
  {
    name: "Apple Watch Series 10",
    slug: "apple-watch-series-10",
    description:
      "Thinner aluminum watch with a brighter always-on display, sleep tracking, and fast charging.",
    price: 399.0,
    stock: 30,
    category: "wearables",
    brand: "apple",
    kg: 0.03,
    l: 4.2,
    w: 3.6,
    h: 0.96,
    color: "#8a8f7a",
    rating: 4.6,
    attributes: [
      { name: "size", value: "42 mm" },
      { name: "color", value: "Silver" },
    ],
  },
  {
    name: "Logitech MX Master 3S",
    slug: "logitech-mx-master-3s",
    description:
      "Quiet MagSpeed scrolling, USB-C charging, and a sculpted shape for all-day desk work across three computers.",
    price: 99.99,
    stock: 50,
    category: "accessories",
    brand: "logitech",
    kg: 0.141,
    l: 12.4,
    w: 8.4,
    h: 5.1,
    color: "#3f3f3f",
    rating: 4.7,
    attributes: [
      { name: "color", value: "Graphite" },
      { name: "wireless", value: "Yes" },
    ],
  },
  {
    name: "Anker 737 Power Bank",
    slug: "anker-737-power-bank",
    description:
      "24,000 mAh USB-C power bank with 140W output, a status screen, and enough headroom to charge a laptop.",
    price: 149.99,
    stock: 28,
    category: "accessories",
    brand: "anker",
    kg: 0.63,
    l: 15.6,
    w: 5.4,
    h: 4.9,
    color: "#1c1c1c",
    rating: 4.6,
    attributes: [
      { name: "capacity", value: "24000 mAh" },
      { name: "output", value: "140W" },
    ],
  },
  {
    name: "Keychron Q1 Max",
    slug: "keychron-q1-max",
    description:
      "Wireless gasket-mounted 75% mechanical keyboard with a CNC aluminum case and hot-swap switches.",
    price: 209.0,
    stock: 16,
    category: "accessories",
    brand: "keychron",
    kg: 1.8,
    l: 32.8,
    w: 14.5,
    h: 4.2,
    color: "#5c4033",
    rating: 4.7,
    attributes: [
      { name: "layout", value: "75%" },
      { name: "wireless", value: "Yes" },
    ],
  },
  {
    name: "Philips Hue White and Color Starter Kit",
    slug: "philips-hue-starter-kit",
    description:
      "Three color bulbs and a Hue Bridge so you can schedule lights, match scenes, and control them from your phone.",
    price: 179.99,
    stock: 20,
    category: "smart-home",
    brand: "philips",
    kg: 0.42,
    l: 18.5,
    w: 14.0,
    h: 8.5,
    color: "#c9a227",
    featured: true,
    rating: 4.4,
    attributes: [
      { name: "bulbs", value: "3" },
      { name: "color", value: "Full color" },
    ],
  },
  {
    name: "Samsung Odyssey G5 27-inch",
    slug: "samsung-odyssey-g5-27",
    description:
      "1000R curved 1440p gaming monitor with 165 Hz refresh, AMD FreeSync, and a thin three-sided bezel.",
    price: 249.99,
    stock: 11,
    category: "computers",
    brand: "samsung",
    kg: 4.1,
    l: 61.6,
    w: 27.2,
    h: 42.3,
    color: "#243044",
    rating: 4.3,
    attributes: [
      { name: "screen", value: "27 inch" },
      { name: "refresh", value: "165 Hz" },
    ],
  },
  {
    name: "Nothing Ear (a)",
    slug: "nothing-ear-a",
    description:
      "Transparent-stem earbuds with ANC, a light charging case, and a clean companion app.",
    price: 99.0,
    stock: 35,
    category: "audio",
    brand: "nothing",
    kg: 0.047,
    l: 4.8,
    w: 4.8,
    h: 2.2,
    color: "#e8e4d9",
    rating: 4.2,
    attributes: [
      { name: "color", value: "White" },
      { name: "wireless", value: "Yes" },
    ],
  },
];

async function main() {
  mkdirSync(uploadDir, { recursive: true });

  const roles = ["customer", "admin", "support", "sales"];
  const roleRecords = [];
  for (const name of roles) {
    roleRecords.push(
      await prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    );
  }
  const customerRole = roleRecords.find((r) => r.name === "customer")!;

  const categories = [
    { name: "Audio", slug: "audio", description: "Headphones, earbuds, and speakers" },
    { name: "Computers", slug: "computers", description: "Laptops, desktops, and displays" },
    { name: "Phones", slug: "phones", description: "Smartphones and accessories" },
    { name: "Wearables", slug: "wearables", description: "Watches and trackers" },
    { name: "Smart Home", slug: "smart-home", description: "Lights, hubs, and home tech" },
    { name: "Accessories", slug: "accessories", description: "Keyboards, mice, and power" },
  ];
  const categoryMap = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description },
      create: category,
    });
    categoryMap.set(row.slug, row.id);
  }

  const brands = [
    { name: "Sony", slug: "sony" },
    { name: "Bose", slug: "bose" },
    { name: "Apple", slug: "apple" },
    { name: "Samsung", slug: "samsung" },
    { name: "Framework", slug: "framework" },
    { name: "Google", slug: "google" },
    { name: "Logitech", slug: "logitech" },
    { name: "Anker", slug: "anker" },
    { name: "Keychron", slug: "keychron" },
    { name: "Philips", slug: "philips" },
    { name: "Nothing", slug: "nothing" },
  ];
  const brandMap = new Map<string, string>();
  for (const brand of brands) {
    const row = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name },
      create: brand,
    });
    brandMap.set(row.slug, row.id);
  }

  for (const product of products) {
    const imageName = `${product.slug}.svg`;
    svg(imageName, product.color, product.name);
    const row = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        price: product.price,
        stockQuantity: product.stock,
        categoryId: categoryMap.get(product.category)!,
        brandId: brandMap.get(product.brand)!,
        weightKg: product.kg,
        weightLb: kgToLb(product.kg),
        lengthCm: product.l,
        widthCm: product.w,
        heightCm: product.h,
        lengthIn: cmToIn(product.l),
        widthIn: cmToIn(product.w),
        heightIn: cmToIn(product.h),
        averageRating: product.rating,
        reviewCount: Math.round(product.rating * 12),
        featured: Boolean(product.featured),
      },
      create: {
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        stockQuantity: product.stock,
        categoryId: categoryMap.get(product.category)!,
        brandId: brandMap.get(product.brand)!,
        weightKg: product.kg,
        weightLb: kgToLb(product.kg),
        lengthCm: product.l,
        widthCm: product.w,
        heightCm: product.h,
        lengthIn: cmToIn(product.l),
        widthIn: cmToIn(product.w),
        heightIn: cmToIn(product.h),
        averageRating: product.rating,
        reviewCount: Math.round(product.rating * 12),
        featured: Boolean(product.featured),
      },
    });
    await prisma.productImage.deleteMany({ where: { productId: row.id } });
    await prisma.productImage.create({
      data: {
        productId: row.id,
        path: imageName,
        altText: `${product.name} product photo`,
        sortOrder: 0,
      },
    });
    await prisma.productAttribute.deleteMany({ where: { productId: row.id } });
    if (product.attributes.length) {
      await prisma.productAttribute.createMany({
        data: product.attributes.map((attribute) => ({
          productId: row.id,
          name: attribute.name,
          value: attribute.value,
        })),
      });
    }
  }

  const demoEmail = "customer@volt.test";
  await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      passwordHash: await argon2.hash("Shopping123"),
      emailVerifiedAt: new Date(),
      displayName: "Demo Customer",
    },
    create: {
      email: demoEmail,
      displayName: "Demo Customer",
      passwordHash: await argon2.hash("Shopping123"),
      emailVerifiedAt: new Date(),
      roleId: customerRole.id,
    },
  });

  console.log(`Seeded ${products.length} products and demo user ${demoEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
