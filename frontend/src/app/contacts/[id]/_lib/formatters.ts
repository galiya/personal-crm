import { format, isToday, isYesterday, isSameDay } from "date-fns";

/* ── URL helpers ── */

export const URL_RE = /(https?:\/\/[^\s<]+)/g;
export const URL_TEST = /^https?:\/\/[^\s<]+$/;

/* ── HTML entity decoder ── */

export function decodeHtmlEntities(s: string): string {
  const el = typeof document !== "undefined" ? document.createElement("textarea") : null;
  if (!el) return s;
  el.innerHTML = s;
  return el.value;
}

/* ── Initials ── */

export function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ── Avatar color ── */

export const avatarColors = [
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-pink-100 text-pink-700",
  "bg-orange-100 text-orange-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-stone-200 text-stone-600",
  "bg-emerald-100 text-emerald-700",
];

export function avatarColor(name: string | null): string {
  if (!name) return avatarColors[6];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

/* ── Score pill ── */

export function scorePillClasses(score: number): {
  bg: string;
  text: string;
  dot: string;
  label: string;
} {
  if (score >= 8)
    return { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Strong" };
  if (score >= 4)
    return { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400", label: "Warm" };
  return { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-400", label: "Cold" };
}

/* ── Date separator helpers ── */

export function dateSeparatorLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

export function needsSeparator(current: string, prev: string | null): boolean {
  if (!prev) return true;
  return !isSameDay(new Date(current), new Date(prev));
}

/* ── Platform label ── */

export function platformLabel(platform: string): string {
  return platform === "manual" ? "Note" : platform.charAt(0).toUpperCase() + platform.slice(1);
}
