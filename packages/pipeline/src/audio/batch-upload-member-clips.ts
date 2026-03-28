/**
 * Batch uploads pre-recorded member intro clips to R2.
 * Matches files named "First Last - PARTY.mp3" to member IDs in the database.
 *
 * Usage: ts-node src/audio/batch-upload-member-clips.ts <directory>
 * Example: ts-node src/audio/batch-upload-member-clips.ts ../../../../member-introductions
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../db/client";
import { uploadMemberClip } from "./uploader";

async function main() {
  const dir = path.resolve(__dirname, process.argv[2] ?? "../../../../member-introductions");

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mp3"));
  console.log(`Found ${files.length} clips in ${dir}\n`);

  // Fetch all members from DB
  const { data: members, error } = await db
    .from("members")
    .select("id, name_display, name_first, name_last");
  if (error) throw error;

  // Build a lookup: "firstname lastname" (lowercase) → member id
  // Some members may share a last name, so we index by full display name too
  const byFullName = new Map<string, string>();
  for (const m of members ?? []) {
    const key = m.name_display.toLowerCase().trim();
    byFullName.set(key, m.id);
  }

  let uploaded = 0;
  const unmatched: string[] = [];

  for (const file of files) {
    // Parse "First Last - PARTY.mp3"
    const stem = file.replace(/\.mp3$/i, "");
    const namePart = stem.split(" - ")[0].trim();
    const key = namePart.toLowerCase();

    const memberId = byFullName.get(key);
    if (!memberId) {
      unmatched.push(file);
      continue;
    }

    const filePath = path.join(dir, file);
    try {
      const url = await uploadMemberClip(filePath, memberId);
      console.log(`✓ ${namePart} → ${memberId}`);
      uploaded++;
    } catch (err) {
      console.error(`✗ ${namePart}: ${(err as Error).message}`);
    }
  }

  console.log(`\nUploaded: ${uploaded}/${files.length}`);

  if (unmatched.length > 0) {
    console.log(`\nNo DB match for ${unmatched.length} files:`);
    for (const f of unmatched) console.log(`  ${f}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
