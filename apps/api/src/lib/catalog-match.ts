export const CATEGORY_ALIASES: Record<string, string> = {
  headphone: "audio",
  headphones: "audio",
  earbud: "audio",
  earbuds: "audio",
  earphone: "audio",
  earphones: "audio",
  headset: "audio",
  speaker: "audio",
  speakers: "audio",
  audio: "audio",
  laptop: "computers",
  laptops: "computers",
  computer: "computers",
  computers: "computers",
  notebook: "computers",
  macbook: "computers",
  monitor: "computers",
  monitors: "computers",
  display: "computers",
  phone: "phones",
  phones: "phones",
  smartphone: "phones",
  smartphones: "phones",
  watch: "wearables",
  watches: "wearables",
  wearable: "wearables",
  keyboard: "accessories",
  keyboards: "accessories",
  mouse: "accessories",
  mice: "accessories",
  charger: "accessories",
  accessories: "accessories",
  light: "smart-home",
  lights: "smart-home",
  hub: "smart-home",
};

const TYPE_SYNONYMS: Record<string, string[]> = {
  laptop: ["laptop", "notebook", "macbook"],
  laptops: ["laptop", "notebook", "macbook"],
  notebook: ["laptop", "notebook", "macbook"],
  macbook: ["laptop", "notebook", "macbook"],
  headphone: ["headphone", "earbud", "earphone", "headset", "airpods"],
  headphones: ["headphone", "earbud", "earphone", "headset", "airpods"],
  earbud: ["headphone", "earbud", "earphone", "headset", "airpods"],
  earbuds: ["headphone", "earbud", "earphone", "headset", "airpods"],
  watch: ["watch"],
  watches: ["watch"],
  phone: ["phone", "smartphone", "iphone"],
  phones: ["phone", "smartphone", "iphone"],
};

export type CatalogHit = {
  id: string;
  name: string;
  description?: string | null;
  category: { slug: string };
  brand: { name: string };
};

function haystack(item: CatalogHit) {
  return `${item.name} ${item.brand.name}`.toLowerCase();
}

function typeWords(tokens: string[]) {
  const words = new Set<string>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    for (const word of TYPE_SYNONYMS[key] ?? [key]) words.add(word);
  }
  return [...words];
}

export function isCategoryOnlyQuery(tokens: string[]) {
  return tokens.length > 0 && tokens.every((token) => CATEGORY_ALIASES[token.toLowerCase()]);
}

export function partitionCatalogHits<T extends CatalogHit>(
  items: T[],
  tokens: string[],
  categorySlug: string | null,
): { matches: T[]; related: T[] } {
  const extraTokens = tokens.filter((token) => !CATEGORY_ALIASES[token.toLowerCase()]);
  const types = typeWords(tokens);
  const categoryOnly = isCategoryOnlyQuery(tokens);

  const matches: T[] = [];
  const related: T[] = [];
  for (const item of items) {
    const hay = haystack(item);
    const extraHit = extraTokens.length === 0 || extraTokens.some((token) => hay.includes(token.toLowerCase()));
    const typeHit = types.some((word) => hay.includes(word));
    const inCategory = Boolean(categorySlug && item.category.slug === categorySlug);
    const direct = extraHit && (typeHit || (categoryOnly && inCategory) || (inCategory && extraTokens.length > 0));
    if (direct) matches.push(item);
    else related.push(item);
  }
  return { matches, related };
}
