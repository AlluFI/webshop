export const STORE_TIME_ZONE = "Europe/Helsinki";
export const STORE_LOCALE = "en-GB";

function asDate(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function zoneParts(date: Date) {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

export function storeCalendarDate(value: Date | string | number = new Date()) {
  const date = asDate(value);
  if (!date) return "";
  const part = zoneParts(date);
  return `${String(part.year).padStart(4, "0")}-${String(part.month).padStart(2, "0")}-${String(part.day).padStart(2, "0")}`;
}

/** UTC instant for a Europe/Helsinki wall-clock time (`YYYY-MM-DD` + `HH:MM:SS`). */
export function storeDateTime(ymd: string, time = "00:00:00") {
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  let instant = new Date(Date.UTC(year, month - 1, day, hour, minute, Math.floor(second || 0)));
  for (let i = 0; i < 3; i += 1) {
    const got = zoneParts(instant);
    const shift =
      Date.UTC(year, month - 1, day, hour, minute, Math.floor(second || 0)) -
      Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    instant = new Date(instant.getTime() + shift);
  }
  return instant;
}

export function storeDayStart(ymd: string) {
  return storeDateTime(ymd, "00:00:00");
}

export function storeDayEnd(ymd: string) {
  return new Date(storeDateTime(ymd, "23:59:59").getTime() + 999);
}

export function addStoreDays(from: Date | string | number, days: number) {
  const ymd = storeCalendarDate(from);
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const stamp = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return storeDateTime(stamp, "12:00:00");
}

function formatInStoreZone(value: Date | string | number, options: Intl.DateTimeFormatOptions) {
  const date = asDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(STORE_LOCALE, { timeZone: STORE_TIME_ZONE, ...options }).format(date);
}

export function formatStoreDateTime(value: Date | string | number) {
  return formatInStoreZone(value, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

export function formatStoreDate(value: Date | string | number) {
  return formatInStoreZone(value, { day: "numeric", month: "short", year: "numeric" });
}

export function formatStoreDateLong(value: Date | string | number) {
  return formatInStoreZone(value, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

export function formatStoreDayMonth(value: Date | string | number) {
  return formatInStoreZone(value, { day: "numeric", month: "short" });
}
