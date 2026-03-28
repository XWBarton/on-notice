export const WA_PARLIAMENTS = {
  wa_la: { id: "wa_la", name: "Legislative Assembly", chamber: "lower" },
  wa_lc: { id: "wa_lc", name: "Legislative Council", chamber: "upper" },
} as const;

export type WAParliamentId = keyof typeof WA_PARLIAMENTS;

/** WA party definitions — keyed by the code used on parliament.wa.gov.au */
export const WA_PARTIES: Record<string, {
  id: string;
  name: string;
  short_name: string;
  colour_hex: string;
}> = {
  ALP:  { id: "wa_alp",  name: "Australian Labor Party (WA)", short_name: "Labor",     colour_hex: "#E53935" },
  LIB:  { id: "wa_lib",  name: "Liberal Party",               short_name: "Liberal",   colour_hex: "#1565C0" },
  NAT:  { id: "wa_nat",  name: "The Nationals WA",            short_name: "Nationals", colour_hex: "#2E7D32" },
  GWA:  { id: "wa_grn",  name: "Greens Western Australia",    short_name: "Greens",    colour_hex: "#43A047" },
  ONP:  { id: "wa_onp",  name: "Pauline Hanson's One Nation", short_name: "One Nation",colour_hex: "#F4A300" },
  AJP:  { id: "wa_ajp",  name: "Animal Justice Party",        short_name: "AJP",       colour_hex: "#4CAF50" },
  AC:   { id: "wa_ac",   name: "Australian Christians",        short_name: "AC",        colour_hex: "#7B1FA2" },
  LCWA: { id: "wa_lcwa", name: "Western Australia Party",      short_name: "WAP",       colour_hex: "#FF6F00" },
  IND:  { id: "wa_ind",  name: "Independent",                  short_name: "Ind",       colour_hex: "#757575" },
};

/** Normalise a raw party string from the site to a WA_PARTIES key */
export function resolvePartyId(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (WA_PARTIES[upper]) return WA_PARTIES[upper].id;
  // Fuzzy fallbacks
  if (upper.includes("LABOR") || upper.includes("ALP")) return "wa_alp";
  if (upper.includes("LIBERAL") || upper === "LIB") return "wa_lib";
  if (upper.includes("NATIONAL")) return "wa_nat";
  if (upper.includes("GREEN")) return "wa_grn";
  if (upper.includes("ONE NATION") || upper.includes("ONP")) return "wa_onp";
  if (upper.includes("CHRISTIAN")) return "wa_ac";
  return "wa_ind";
}
