import { Prisma } from "@prisma/client";
import { catalogQuerySchema, suggestQuerySchema } from "@volt/shared";
import { prisma } from "../prisma.js";
import { HttpError } from "../http-error.js";

function money(value: Prisma.Decimal | number | string) {
  return Number(value);
}

function mapProduct(product: {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: Prisma.Decimal;
  stockQuantity: number;
  weightKg: Prisma.Decimal;
  weightLb: Prisma.Decimal;
  lengthCm: Prisma.Decimal;
  widthCm: Prisma.Decimal;
  heightCm: Prisma.Decimal;
  lengthIn: Prisma.Decimal;
  widthIn: Prisma.Decimal;
  heightIn: Prisma.Decimal;
  averageRating: number;
  reviewCount: number;
  featured: boolean;
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string; slug: string };
  images: { path: string; altText: string; sortOrder: number }[];
  attributes: { name: string; value: string }[];
}) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: money(product.price),
    stockQuantity: product.stockQuantity,
    category: product.category,
    brand: product.brand,
    images: product.images
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => ({
        url: `/api/v1/files/${image.path}`,
        altText: image.altText,
      })),
    weightKg: money(product.weightKg),
    weightLb: money(product.weightLb),
    dimensions: {
      metric: {
        lengthCm: money(product.lengthCm),
        widthCm: money(product.widthCm),
        heightCm: money(product.heightCm),
      },
      imperial: {
        lengthIn: money(product.lengthIn),
        widthIn: money(product.widthIn),
        heightIn: money(product.heightIn),
      },
    },
    averageRating: product.averageRating,
    reviewCount: product.reviewCount,
    featured: product.featured,
    attributes: product.attributes,
  };
}

const include = {
  category: true,
  brand: true,
  images: true,
  attributes: true,
} as const;

export const catalogService = {
  async categories() {
    return prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
  },

  async brands() {
    return prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
  },

  async list(rawQuery: unknown) {
    const query = catalogQuerySchema.parse(rawQuery);
    const where: Prisma.ProductWhereInput = {};
    if (query.category) where.category = { slug: query.category };
    if (query.brand) where.brand = { slug: query.brand };
    if (query.minPrice != null || query.maxPrice != null) {
      where.price = {};
      if (query.minPrice != null) where.price.gte = query.minPrice;
      if (query.maxPrice != null) where.price.lte = query.maxPrice;
    }
    if (query.minRating != null) where.averageRating = { gte: query.minRating };
    if (query.featured === "true") where.featured = true;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
        { brand: { name: { contains: query.q, mode: "insensitive" } } },
      ];
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] =
      [{ featured: "desc" }, { createdAt: "desc" }];
    if (query.sort === "price_asc") orderBy = { price: "asc" };
    if (query.sort === "price_desc") orderBy = { price: "desc" };
    if (query.sort === "rating") orderBy = { averageRating: "desc" };

    const skip = (query.page - 1) * query.pageSize;

    const [total, items, brandFacets, categoryFacets, priceAgg] = await Promise.all([
      prisma.product.count({ where }),
      query.q && query.sort === "relevance"
        ? searchByRelevance(query.q, where, skip, query.pageSize)
        : prisma.product.findMany({
            where,
            include,
            orderBy,
            skip,
            take: query.pageSize,
          }),
      prisma.product.groupBy({
        by: ["brandId"],
        where: { ...where, brand: undefined },
        _count: { _all: true },
      }),
      prisma.product.groupBy({
        by: ["categoryId"],
        where: { ...where, category: undefined },
        _count: { _all: true },
      }),
      prisma.product.aggregate({
        where: { ...where, price: undefined },
        _min: { price: true },
        _max: { price: true },
      }),
    ]);

    const brands = await prisma.brand.findMany();
    const categories = await prisma.category.findMany();
    const brandMap = new Map(brands.map((b) => [b.id, b]));
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return {
      items: items.map(mapProduct),
      total,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      facets: {
        brands: brandFacets
          .map((row) => {
            const brand = brandMap.get(row.brandId);
            return brand
              ? { slug: brand.slug, name: brand.name, count: row._count._all }
              : null;
          })
          .filter(Boolean),
        categories: categoryFacets
          .map((row) => {
            const category = categoryMap.get(row.categoryId);
            return category
              ? {
                  slug: category.slug,
                  name: category.name,
                  count: row._count._all,
                }
              : null;
          })
          .filter(Boolean),
        price: {
          min: priceAgg._min.price ? money(priceAgg._min.price) : 0,
          max: priceAgg._max.price ? money(priceAgg._max.price) : 0,
        },
      },
    };
  },

  async byIdOrSlug(idOrSlug: string) {
    const product = await prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include,
    });
    if (!product) throw new HttpError(404, "Product not found");
    return mapProduct(product);
  },

  async recommend(options: { excludeIds: string[]; categoryIds: string[]; brandIds: string[]; take?: number }) {
    const take = options.take ?? 4;
    const exclude = options.excludeIds.filter(Boolean);
    if (options.categoryIds.length === 0 && options.brandIds.length === 0) return [];
    const candidates = await prisma.product.findMany({
      where: {
        id: exclude.length ? { notIn: exclude } : undefined,
        stockQuantity: { gt: 0 },
        OR: [
          options.categoryIds.length ? { categoryId: { in: options.categoryIds } } : undefined,
          options.brandIds.length ? { brandId: { in: options.brandIds } } : undefined,
        ].filter(Boolean) as Prisma.ProductWhereInput[],
      },
      include,
      take: 24,
      orderBy: [{ featured: "desc" }, { averageRating: "desc" }],
    });
    const scored = candidates
      .map((product) => {
        let score = 0;
        if (options.categoryIds.includes(product.categoryId)) score += 2;
        if (options.brandIds.includes(product.brandId)) score += 1;
        return { product, score };
      })
      .sort((a, b) => b.score - a.score || b.product.averageRating - a.product.averageRating);
    return scored.slice(0, take).map((row) => mapProduct(row.product));
  },

  async suggest(rawQuery: unknown) {
    const { q } = suggestQuerySchema.parse(rawQuery);
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: { id: true, name: true, slug: true },
      take: 8,
      orderBy: { name: "asc" },
    });
    const categories = await prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { name: true, slug: true },
      take: 4,
    });
    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        href: `/products/${p.slug}`,
      })),
      categories: categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        href: `/catalog?category=${c.slug}`,
      })),
    };
  },
};

async function searchByRelevance(
  q: string,
  where: Prisma.ProductWhereInput,
  skip: number,
  take: number,
) {
  try {
    const ranked = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM products
      WHERE search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
      OFFSET ${skip}
      LIMIT ${take}
    `;
    if (ranked.length === 0) {
      return prisma.product.findMany({
        where,
        include,
        skip,
        take,
        orderBy: { name: "asc" },
      });
    }
    const products = await prisma.product.findMany({
      where: { id: { in: ranked.map((row) => row.id) } },
      include,
    });
    const order = new Map(ranked.map((row, index) => [row.id, index]));
    return products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } catch {
    return prisma.product.findMany({
      where,
      include,
      skip,
      take,
      orderBy: { name: "asc" },
    });
  }
}
