/**
 * Uploads episode audio to Cloudflare R2.
 * Returns the public CDN URL.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import * as path from "node:path";
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

export async function uploadClip(
  localPath: string,
  parliamentId: string,
  date: string,
  questionNumber: number
): Promise<string> {
  const key = `audio/${parliamentId}/${date}/q${String(questionNumber).padStart(2, "0")}.mp3`;
  const body = fs.readFileSync(localPath);

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: "audio/mpeg",
    CacheControl: "public, max-age=3600",
  }));

  return `${CDN_BASE}/${key}`;
}

export async function uploadChapters(
  localPath: string,
  parliamentId: string,
  date: string
): Promise<string> {
  const key = `audio/${parliamentId}/${date}/chapters.json`;
  const body = fs.readFileSync(localPath);

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/json+chapters",
    CacheControl: "public, max-age=3600",
  }));

  return `${CDN_BASE}/${key}`;
}

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
    CacheControl: "public, max-age=3600",
  }));

  return `${CDN_BASE}/${key}`;
}

export async function uploadMemberClip(
  localPath: string,
  memberId: string
): Promise<string> {
  const key = `audio/members/${memberId}.mp3`;
  const body = fs.readFileSync(localPath);

  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: "audio/mpeg",
    CacheControl: "public, max-age=31536000",
  }));

  return `${CDN_BASE}/${key}`;
}

/**
 * Download pre-recorded name clips for a list of member IDs.
 * Members without a clip are silently skipped.
 * Returns a map of memberId → local file path.
 */
export async function fetchMemberClips(
  memberIds: string[],
  workDir: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  await Promise.all(memberIds.map(async (memberId) => {
    const key = `audio/members/${memberId}.mp3`;
    try {
      const response = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      if (!response.Body) return;

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      const localPath = path.join(workDir, `member_${memberId.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp3`);
      fs.writeFileSync(localPath, Buffer.concat(chunks));
      result.set(memberId, localPath);
    } catch {
      // No clip for this member — skip silently
    }
  }));

  return result;
}
