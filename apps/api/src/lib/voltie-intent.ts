export type VoltieIntent =
  | "search"
  | "shipping"
  | "returns"
  | "warranty"
  | "payments"
  | "promos"
  | "orders"
  | "claim"
  | "enquiry"
  | "help";

const ORDER_REF = /\bVC-[0-9A-F]{8}\b/i;

export function extractOrderReference(text: string) {
  return text.match(ORDER_REF)?.[0]?.toUpperCase() ?? null;
}

export function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

export function wantsLatestOrder(text: string) {
  return /\b(latest|last|most recent)\b/i.test(text);
}

const TYPO_ALIASES: Record<string, string> = {
  shoe: "show",
  shw: "show",
  shew: "show",
  shwo: "show",
  sow: "show",
  oder: "order",
  orer: "order",
  ordr: "order",
  ordres: "orders",
  shiping: "shipping",
  shippin: "shipping",
  shpping: "shipping",
  delievery: "delivery",
  retrun: "return",
  refound: "refund",
  warrenty: "warranty",
  warrany: "warranty",
  headphons: "headphones",
  headphon: "headphones",
  headhones: "headphones",
  headphnes: "headphones",
  labtop: "laptop",
  laptp: "laptop",
  availible: "available",
  avaliable: "available",
};

const CORRECTABLE = [
  "show",
  "find",
  "search",
  "list",
  "sell",
  "email",
  "contact",
  "order",
  "orders",
  "shipping",
  "delivery",
  "return",
  "refund",
  "warranty",
  "claim",
  "ticket",
  "support",
  "promo",
  "discount",
  "payment",
  "headphones",
  "earbuds",
  "earphones",
  "headset",
  "laptop",
  "laptops",
  "phone",
  "phones",
  "audio",
  "sony",
  "bose",
  "latest",
  "available",
  "status",
  "tracking",
];

export type VoltieCorrection = {
  text: string;
  changes: { from: string; to: string }[];
  suggestions: string[];
};

export type VoltieUtterance = {
  text: string;
  intent: VoltieIntent;
  note: string;
  ask: string[];
};

function editDistance(left: string, right: string) {
  const rows = left.length;
  const cols = right.length;
  const grid = Array.from({ length: rows + 1 }, (_, index) => {
    const row = new Array<number>(cols + 1);
    row[0] = index;
    return row;
  });
  for (let col = 0; col <= cols; col += 1) grid[0][col] = col;
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      grid[row][col] =
        left[row - 1] === right[col - 1]
          ? grid[row - 1][col - 1]
          : 1 + Math.min(grid[row - 1][col], grid[row][col - 1], grid[row - 1][col - 1]);
    }
  }
  return grid[rows][cols];
}

function preserveCase(original: string, replacement: string) {
  if (!original || original[0] !== original[0].toUpperCase()) return replacement;
  return replacement.slice(0, 1).toUpperCase() + replacement.slice(1);
}

function candidatesFor(word: string) {
  const lower = word.toLowerCase();
  if (TYPO_ALIASES[lower]) return [TYPO_ALIASES[lower]];
  if (CORRECTABLE.includes(lower) || lower.length < 3) return [lower];
  const max = lower.length <= 4 ? 1 : 2;
  const hits: { word: string; distance: number }[] = [];
  for (const option of CORRECTABLE) {
    if (Math.abs(option.length - lower.length) > max) continue;
    const distance = editDistance(lower, option);
    if (distance > 0 && distance <= max) hits.push({ word: option, distance });
  }
  hits.sort((left, right) => left.distance - right.distance || left.word.localeCompare(right.word));
  if (!hits.length) return [lower];
  const best = hits[0].distance;
  return hits.filter((hit) => hit.distance === best).map((hit) => hit.word);
}

function expandVariants(parts: string[][]) {
  let rows = [""];
  for (const options of parts) {
    const next: string[] = [];
    for (const row of rows) {
      for (const option of options.slice(0, 2)) next.push(row + option);
    }
    rows = next.slice(0, 8);
  }
  return [...new Set(rows)];
}

export function softenVoltieText(text: string): VoltieCorrection {
  const pieces = text.split(/(\b[\w']+\b)/);
  const changes: { from: string; to: string }[] = [];
  const variants: string[][] = [];
  for (const piece of pieces) {
    if (!/^[\w']+$/.test(piece) || ORDER_REF.test(piece) || piece.includes("@") || /^\d+$/.test(piece)) {
      variants.push([piece]);
      continue;
    }
    const options = candidatesFor(piece);
    const rendered = options.map((option) => preserveCase(piece, option));
    if (rendered.length === 1 && rendered[0].toLowerCase() !== piece.toLowerCase()) {
      changes.push({ from: piece, to: rendered[0] });
    }
    variants.push(rendered);
  }
  const corrected = variants.map((options) => options[0]).join("");
  const suggestions = expandVariants(variants).filter((value) => value !== text && classifyVoltieIntent(value) !== "help");
  return { text: corrected, changes, suggestions };
}

export function resolveVoltieUtterance(text: string): VoltieUtterance {
  const originalIntent = classifyVoltieIntent(text);
  if (originalIntent !== "help") {
    return { text, intent: originalIntent, note: "", ask: [] };
  }
  const softened = softenVoltieText(text);
  const correctedIntent = classifyVoltieIntent(softened.text);
  if (correctedIntent !== "help") {
    const note = softened.changes.length
      ? `I took ${softened.changes.map((change) => `“${change.from}” as “${change.to}”`).join(" and ")}.`
      : "";
    return { text: softened.text, intent: correctedIntent, note, ask: [] };
  }
  if (softened.suggestions.length) {
    return { text, intent: "help", note: "", ask: softened.suggestions.slice(0, 2) };
  }
  return { text, intent: "help", note: "", ask: [] };
}

export function classifyVoltieIntent(text: string): VoltieIntent {
  const value = text.toLowerCase();
  if (/(claim|damaged|broken|smashed|not satisf|wrong item|missing item|defective)/.test(value)) {
    return "claim";
  }
  if (
    ORDER_REF.test(text) ||
    /\b(my orders?|latest order|last order|recent order|most recent|order status|where('s| is) my|tracking|delivery status|show (me )?(my )?(latest |last |recent )?(orders?))\b/.test(
      value,
    )
  ) {
    return "orders";
  }
  if (/(contact|customer service|speak to (a )?human|email support|send (this )?to support|open a ticket|enquiry|inquiry)/.test(value)) {
    return "enquiry";
  }
  if (/(return|refund|send back)/.test(value)) return "returns";
  if (/(warrant)/.test(value)) return "warranty";
  if (/(promo|discount|30-day|lowest price|on sale)/.test(value)) return "promos";
  if (/(stripe|card number|pci|pay with)/.test(value)) return "payments";
  if (/(ship|deliver|express|standard postage|how long)/.test(value)) return "shipping";
  if (
    /(find|search|looking for|recommend|have you got|do you sell|what kind|available|headphones?|earbuds?|earphones?|headset|laptop|phone|sony|xm5|bose|audio)/.test(
      value,
    )
  ) {
    return "search";
  }
  return "help";
}

const SEARCH_STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "sell",
  "have",
  "got",
  "any",
  "can",
  "please",
  "looking",
  "find",
  "search",
  "want",
  "need",
  "buy",
  "get",
  "stock",
  "about",
  "with",
  "from",
  "this",
  "that",
  "what",
  "which",
  "your",
  "shop",
  "are",
  "is",
  "was",
  "were",
  "available",
  "kind",
  "kinds",
  "type",
  "types",
  "sort",
  "sorts",
  "some",
  "these",
  "those",
  "them",
  "just",
  "like",
  "also",
  "currently",
  "there",
  "does",
  "did",
  "how",
  "much",
  "many",
  "list",
  "show",
  "all",
  "ones",
  "products",
  "items",
  "something",
  "anything",
  "me",
  "do",
  "in",
  "on",
  "to",
  "of",
  "or",
  "if",
  "our",
  "recommend",
  "recommendation",
  "recommendations",
]);

const SEARCH_PREFIX =
  /^(do you (sell|have|stock)|have you got|can i (buy|get)|can you (show|find|recommend|list)?|please |i want |i need |i('m| am) looking for |what (kind|type|sort)s? of |which (kind|type|sort)s? of |what |which |show me |list |are there (any )?)/i;
const SEARCH_SUFFIX =
  /\b(are (there )?(any )?(available|in stock)?|available|in stock|do you (sell|have|stock)|please)\s*\?*$/i;

export function searchQueryFrom(text: string) {
  return text.replace(SEARCH_PREFIX, "").replace(SEARCH_SUFFIX, "").replace(/\?+$/, "").trim().slice(0, 80);
}

export function searchTokens(text: string) {
  const cleaned = searchQueryFrom(text);
  const words = cleaned
    .split(/\W+/)
    .filter((word) => word.length >= 3 && !SEARCH_STOP.has(word.toLowerCase()))
    .sort((left, right) => right.length - left.length);
  return words.length ? words : cleaned ? [cleaned] : [];
}
