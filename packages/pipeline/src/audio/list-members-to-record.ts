/**
 * Lists all active members and writes a Typst checklist for recording intros.
 * Usage: ts-node src/audio/list-members-to-record.ts [parliament_id]
 * Output: members-to-record.typ in the on-notice root directory
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../db/client";

async function main() {
  const parliamentId = process.argv[2];

  let query = db
    .from("members")
    .select("id, name_display, parliament_id, parties(short_name)")
    .order("name_display");

  if (parliamentId) {
    query = (query as typeof query).eq("parliament_id", parliamentId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const members = (data ?? []) as unknown as Array<{
    id: string;
    name_display: string;
    parliament_id: string;
    parties: { short_name: string } | null;
  }>;

  const lines = [
    `#set page(paper: "a4", margin: 2cm)`,
    `#set text(size: 10pt, font: "New Computer Modern")`,
    ``,
    `= Members to Record (${members.length})`,
    ``,
    `#columns(2)[`,
    ...members.map((m) => {
      const party = m.parties?.short_name ?? "Unknown";
      return `  - #box(width: 0.85em, height: 0.85em, stroke: 0.6pt) #h(0.3em)*${m.name_display}* (${party})`;
    }),
    `]`,
  ];

  const outPath = path.resolve(__dirname, "../../../../members-to-record.typ");
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Written to ${outPath} (${members.length} members)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
