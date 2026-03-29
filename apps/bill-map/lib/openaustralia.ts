// OpenAustralia API client — fallback source for bill debate text
// Used when APH bills API is unavailable.

const OA_API = "https://www.openaustralia.org.au/api";

interface OADebateSection {
  id: string;
  title?: { "#text": string } | string;
  body?: string;
  htype?: string;
}

export interface ParsedBillFromOA {
  shortTitle: string;
  stage: "introduction" | "first_reading" | "second_reading" | "third_reading";
  date: string;
  house: "representatives" | "senate";
}

function apiKey(): string {
  return process.env.OPEN_AUSTRALIA_API_KEY ?? "";
}

function inferStage(text: string): ParsedBillFromOA["stage"] {
  const upper = text.toUpperCase();
  if (upper.includes("THIRD")) return "third_reading";
  if (upper.includes("SECOND")) return "second_reading";
  if (upper.includes("FIRST")) return "first_reading";
  return "introduction";
}

function isBillSection(section: OADebateSection): boolean {
  const title =
    typeof section.title === "string"
      ? section.title
      : section.title?.["#text"] ?? "";
  const combined = (title + " " + (section.body ?? "")).toUpperCase();
  return (
    combined.includes("BILL") &&
    (combined.includes("READING") || combined.includes("INTRODUCTION"))
  );
}

function extractShortTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*[—–-]\s*(first|second|third)\s+reading.*/i, "")
    .replace(/\s*[—–-]\s*introduction.*/i, "")
    .trim();
}

export async function fetchBillsForDate(
  date: string,
  house: "representatives" | "senate",
): Promise<ParsedBillFromOA[]> {
  const url = `${OA_API}/getDebates?type=${house}&date=${date}&key=${apiKey()}&output=json`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];

    const sections = (await res.json()) as OADebateSection[];
    if (!Array.isArray(sections)) return [];

    const bills: ParsedBillFromOA[] = [];
    for (const section of sections) {
      if (!isBillSection(section)) continue;
      const rawTitle =
        typeof section.title === "string"
          ? section.title
          : section.title?.["#text"] ?? "";
      if (!rawTitle) continue;
      bills.push({
        shortTitle: extractShortTitle(rawTitle),
        stage: inferStage(rawTitle),
        date,
        house,
      });
    }
    return bills;
  } catch {
    return [];
  }
}
