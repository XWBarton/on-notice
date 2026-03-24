/**
 * Text-to-speech overdubs via Amazon Polly.
 * Generates short intro clips: "Question from [Name], [Party]."
 */

import { PollyClient, SynthesizeSpeechCommand, Engine, LanguageCode, OutputFormat, VoiceId } from "@aws-sdk/client-polly";
import * as fs from "node:fs";
import * as path from "node:path";

const polly = new PollyClient({ region: "ap-southeast-2" });

// Australian English neural voice
const VOICE: VoiceId = "Olivia";

export async function generateIntroClip(
  text: string,
  outputPath: string
): Promise<string> {
  const cmd = new SynthesizeSpeechCommand({
    Text: text,
    Engine: Engine.NEURAL,
    LanguageCode: LanguageCode.en_AU,
    VoiceId: VOICE,
    OutputFormat: OutputFormat.MP3,
  });

  const response = await polly.send(cmd);
  if (!response.AudioStream) throw new Error("Polly returned no audio stream");

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  fs.writeFileSync(outputPath, Buffer.concat(chunks));
  return outputPath;
}

export function introText(
  askerName: string | null,
  askerParty: string | null,
  ministerName: string | null,
  questionNumber: number
): string {
  const asker = askerName ?? "A member";
  const party = askerParty ? `, ${askerParty}` : "";
  const minister = ministerName ? ` to ${ministerName}` : "";
  return `Question ${questionNumber}. From ${asker}${party}${minister}.`;
}
