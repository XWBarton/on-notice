/**
 * Uploads episode audio to Cloudflare R2.
 * Returns the public CDN URL.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "node:fs";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!, // https://<account-id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;
const CDN_BASE = process.env.R2_CDN_URL ?? `https://audio.onnotice.au`;

export async function uploadEpisode(
  localPath: string,
  parliamentId: string,
  date: string
): Promise<string> {
  const key = `audio/${parliamentId}/${date}/episode.mp3`;
  const body = fs.readFileSync(localPath);

  console.log(`  Uploading ${(body.length / 1024 / 1024).toFixed(1)}MB to R2: ${key}`);

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: "audio/mpeg",
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return `${CDN_BASE}/${key}`;
}
