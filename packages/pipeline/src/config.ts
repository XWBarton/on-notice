export interface ParliamentConfig {
  id: string;
  name: string;
  jurisdiction: "federal" | "wa";
  chamber: "lower" | "upper";
  governmentParties: string[];     // party IDs currently in government
  questionTimeChamber: boolean;    // does this chamber have question time?
  sittingStartHour: number;        // approx local time (24h) for afternoon sitting
  timezone: string;
}

export const PARLIAMENTS: Record<string, ParliamentConfig> = {
  fed_hor: {
    id: "fed_hor",
    name: "House of Representatives",
    jurisdiction: "federal",
    chamber: "lower",
    governmentParties: ["alp"],    // Labor majority government (2022–)
    questionTimeChamber: true,
    sittingStartHour: 14,          // 2pm AEST/AEDT
    timezone: "Australia/Sydney",
  },
  fed_sen: {
    id: "fed_sen",
    name: "Senate",
    jurisdiction: "federal",
    chamber: "upper",
    governmentParties: ["alp"],
    questionTimeChamber: true,
    sittingStartHour: 14,
    timezone: "Australia/Sydney",
  },
  wa_la: {
    id: "wa_la",
    name: "Legislative Assembly",
    jurisdiction: "wa",
    chamber: "lower",
    governmentParties: ["alp"],    // Labor majority government (2021–)
    questionTimeChamber: true,
    sittingStartHour: 14,          // 2pm AWST
    timezone: "Australia/Perth",
  },
};

// Federal party IDs (matched to OpenAustralia/Hansard party names)
// Keys include all known OA name variations for each party
export const FEDERAL_PARTIES: Record<string, { id: string; name: string; short_name: string; colour_hex: string }> = {
  "Australian Labor Party": { id: "alp", name: "Australian Labor Party", short_name: "ALP", colour_hex: "#D34547" },
  "Labor": { id: "alp", name: "Australian Labor Party", short_name: "ALP", colour_hex: "#D34547" },
  "ALP": { id: "alp", name: "Australian Labor Party", short_name: "ALP", colour_hex: "#D34547" },
  "Liberal Party of Australia": { id: "lib", name: "Liberal Party of Australia", short_name: "LIB", colour_hex: "#2A4E97" },
  "Liberal Party": { id: "lib", name: "Liberal Party of Australia", short_name: "LIB", colour_hex: "#2A4E97" },
  "Liberal": { id: "lib", name: "Liberal Party of Australia", short_name: "LIB", colour_hex: "#2A4E97" },
  "LIBERA": { id: "lib", name: "Liberal Party of Australia", short_name: "LIB", colour_hex: "#2A4E97" },
  "LP": { id: "lib", name: "Liberal Party of Australia", short_name: "LIB", colour_hex: "#2A4E97" },
  "Liberal National Party": { id: "lnp", name: "Liberal National Party", short_name: "LNP", colour_hex: "#244B77" },
  "LNP": { id: "lnp", name: "Liberal National Party", short_name: "LNP", colour_hex: "#244B77" },
  "The Nationals": { id: "nat", name: "The Nationals", short_name: "NAT", colour_hex: "#406D50" },
  "Nationals": { id: "nat", name: "The Nationals", short_name: "NAT", colour_hex: "#406D50" },
  "National Party": { id: "nat", name: "The Nationals", short_name: "NAT", colour_hex: "#406D50" },
  "National Party of Australia": { id: "nat", name: "The Nationals", short_name: "NAT", colour_hex: "#406D50" },
  "National": { id: "nat", name: "The Nationals", short_name: "NAT", colour_hex: "#406D50" },
  "NATION": { id: "nat", name: "The Nationals", short_name: "NAT", colour_hex: "#406D50" },
  "NP": { id: "nat", name: "The Nationals", short_name: "NAT", colour_hex: "#406D50" },
  "Australian Greens": { id: "grn", name: "Australian Greens", short_name: "GRN", colour_hex: "#3B874A" },
  "Greens": { id: "grn", name: "Australian Greens", short_name: "GRN", colour_hex: "#3B874A" },
  "AG": { id: "grn", name: "Australian Greens", short_name: "GRN", colour_hex: "#3B874A" },
  "Independent": { id: "ind", name: "Independent", short_name: "IND", colour_hex: "#757575" },
  "Centre Alliance": { id: "ca", name: "Centre Alliance", short_name: "CA", colour_hex: "#4B9FB4" },
  "Climate 200": { id: "cli200", name: "Climate 200", short_name: "TEAL", colour_hex: "#4B9FB4" },
  "Katter's Australian Party": { id: "kap", name: "Katter's Australian Party", short_name: "KAP", colour_hex: "#795548" },
  "United Australia Party": { id: "uap", name: "United Australia Party", short_name: "UAP", colour_hex: "#FDD835" },
  "Pauline Hanson's One Nation": { id: "on", name: "One Nation", short_name: "ON", colour_hex: "#E1733C" },
  "Pauline Hanson's One Nation Party": { id: "on", name: "One Nation", short_name: "ON", colour_hex: "#E1733C" },
  "One Nation": { id: "on", name: "One Nation", short_name: "ON", colour_hex: "#E1733C" },
  "PAULIN": { id: "on", name: "One Nation", short_name: "ON", colour_hex: "#E1733C" },
  "ON": { id: "on", name: "One Nation", short_name: "ON", colour_hex: "#E1733C" },
  "Australia's Voice": { id: "av", name: "Australia's Voice", short_name: "AV", colour_hex: "#7B61B2" },
  "AUSTRA": { id: "av", name: "Australia's Voice", short_name: "AV", colour_hex: "#7B61B2" },
  "Jacqui Lambie Network": { id: "jln", name: "Jacqui Lambie Network", short_name: "JLN", colour_hex: "#E07B39" },
  "JACQUI": { id: "jln", name: "Jacqui Lambie Network", short_name: "JLN", colour_hex: "#E07B39" },
  "Country Liberal Party": { id: "clp", name: "Country Liberal Party", short_name: "CLP", colour_hex: "#B07D3A" },
  "COUNTR": { id: "clp", name: "Country Liberal Party", short_name: "CLP", colour_hex: "#B07D3A" },
  "Speaker": { id: "spk", name: "Speaker", short_name: "SPK", colour_hex: "#9E9E9E" },
  "SPEAKE": { id: "spk", name: "Speaker", short_name: "SPK", colour_hex: "#9E9E9E" },
  "President of the Senate": { id: "presid", name: "President of the Senate", short_name: "PRES", colour_hex: "#9E9E9E" },
  "PRESID": { id: "presid", name: "President of the Senate", short_name: "PRES", colour_hex: "#9E9E9E" },
  "Deputy President": { id: "deputy", name: "Deputy President", short_name: "DEP", colour_hex: "#BDBDBD" },
  "DEPUTY": { id: "deputy", name: "Deputy President", short_name: "DEP", colour_hex: "#BDBDBD" },
};

export const OPEN_AUSTRALIA_API = "https://www.openaustralia.org.au/api";
export const APH_HANSARD_API = "https://www.aph.gov.au/api/hansard";
export const THEY_VOTE_FOR_YOU_API = "https://theyvoteforyou.org.au/api/v1";
