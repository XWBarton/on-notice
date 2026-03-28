/**
 * CLI script to upload a pre-recorded member name clip to R2.
 *
 * Usage:
 *   npx tsx src/audio/upload-member-clip.ts <memberId> <path-to-file.mp3>
 *
 * Example:
 *   npx tsx src/audio/upload-member-clip.ts uk.parliament.member.123 ~/recordings/smith.mp3
 */

import { uploadMemberClip } from "./uploader.js";

const [memberId, filePath] = process.argv.slice(2);

if (!memberId || !filePath) {
  console.error("Usage: upload-member-clip.ts <memberId> <path-to-file.mp3>");
  process.exit(1);
}

const url = await uploadMemberClip(filePath, memberId);
console.log(`Uploaded: ${url}`);
