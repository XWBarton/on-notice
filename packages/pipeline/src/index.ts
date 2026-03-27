/**
 * On Notice — Nightly Pipeline Orchestrator
 *
 * Runs nightly via GitHub Actions. Processes Federal Parliament (HoR) by default.
 * Usage: ts-node src/index.ts [--parliament fed_hor] [--date 2025-04-09] [--skip-audio]
 */

import { parseArgs } from "node:util";
import { format } from "date-fns";
import { db } from "./db/client";
import { PARLIAMENTS, FEDERAL_PARTIES } from "./config";
import { syncFederalMembers } from "./scrapers/fed-members";
import { fetchDebates, fetchSpeechRows } from "./scrapers/fed-hansard";
import { fetchDivisionsForDate } from "./scrapers/tvfy-divisions";
import { parseDebates } from "./parsers/hansard-xml";
import { classifyQuestion, resetMemberCache } from "./parsers/questions";
import { buildTranscript } from "./parsers/transcript";
import { summariseBill } from "./ai/summarise-bill";
import { summariseQuestion } from "./ai/summarise-question";
import { summariseDay } from "./ai/summarise-day";
import { summariseDivision } from "./ai/summarise-division";
import { upsertDivisions } from "./db/upsert-divisions";
import { findParlViewVideo, questionTimeOffsets, fetchParlViewCaptions, fetchEventChunks, findChunkForTimecode, timecodeToSeconds } from "./scrapers/parlview";
import { downloadQuestionTimeAudio, createAudioWorkDir } from "./audio/downloader";
import { buildEpisode, type QuestionSegment } from "./audio/editor";
import { uploadEpisode, uploadClip, uploadChapters } from "./audio/uploader";
import { buildQtTranscriptFromParlViewCaptions } from "./audio/captions";
import { extractTimestampsWithAI } from "./ai/timestamp-questions";
import * as fs from "node:fs";

async function run() {
  const { values } = parseArgs({
    options: {
      parliament: { type: "string", default: "fed_hor" },
      date: { type: "string", default: new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(Date.now() - 864e5)) },
      "skip-audio": { type: "boolean", default: false },
      "members-only": { type: "boolean", default: false },
    },
  });

  const parliamentId = values.parliament as string;
  const date = values.date as string;
  const skipAudio = values["skip-audio"] as boolean;

  const config = PARLIAMENTS[parliamentId];
  if (!config) throw new Error(`Unknown parliament: ${parliamentId}`);

  console.log(`\n=== On Notice Pipeline ===`);
  console.log(`Parliament: ${config.name}`);
  console.log(`Date: ${date}`);
  console.log(`Skip audio: ${skipAudio}`);
  console.log(`========================\n`);

  // ── Step 1: Sync members (weekly) ───────────────────────────────────────────
  console.log("Step 1: Syncing members...");
  if (config.jurisdiction === "federal") {
    await syncFederalMembers(parliamentId as "fed_hor" | "fed_sen").catch((e) => {
      console.warn(`Member sync failed (OA may be down): ${e.message} — continuing with existing member data`);
    });
  }
  if (values["members-only"]) {
    console.log("Members-only mode, exiting.");
    return;
  }
  resetMemberCache();

  // ── Step 2: Check for sitting / create sitting_days row ─────────────────────
  console.log("Step 2: Checking for sitting day...");
  const oaType = config.chamber === "lower" ? "representatives" : "senate";

  const debateData = await fetchDebates(date, oaType as "representatives" | "senate");
  if (!debateData) {
    console.log(`No debates found for ${date} — parliament likely not sitting. Exiting.`);
    return;
  }

  const { data: sitting, error: sittingError } = await db
    .from("sitting_days")
    .upsert(
      {
        parliament_id: parliamentId,
        sitting_date: date,
        pipeline_status: "running",
      },
      { onConflict: "parliament_id,sitting_date" }
    )
    .select("id")
    .single();

  if (sittingError || !sitting) throw new Error(`Failed to create sitting day: ${sittingError?.message}`);
  const sittingDayId = sitting.id;
  console.log(`Sitting day ID: ${sittingDayId}`);

  try {
    // ── Step 3: Parse debates from OpenAustralia ───────────────────────────────
    console.log("Step 3: Parsing debates...");
    const { bills: allBills, questions: allQuestions, divisionTimes } = parseDebates(debateData);

    console.log(`Parsed: ${allBills.length} bills, ${allQuestions.length} questions`);

    // ── Step 3b: Enrich questions with full speech content from OA ─────────────
    console.log("Step 3b: Fetching individual speech content for questions...");
    const stripHtml = (html: string) => html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#8212;/g, "—").replace(/&#8211;/g, "–").replace(/&#8216;/g, "'")
      .replace(/&#8217;/g, "'").replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, " ")
      .replace(/\s+/g, " ").trim();

    const questionsWithContent = [];
    for (const q of allQuestions) {
      if (!q.gid) {
        questionsWithContent.push({ ...q, transcriptJson: null });
        continue;
      }

      const rows = await fetchSpeechRows(q.gid, oaType as "representatives" | "senate").catch(() => []);

      // First htype=12 row is the question; subsequent ones include the answer
      const speechRows = rows.filter((r) => r.htype === "12");
      const questionRow = speechRows[0];
      const answerRows = speechRows.slice(1);

      questionsWithContent.push({
        ...q,
        askerName: questionRow?.speaker
          ? `${questionRow.speaker.first_name} ${questionRow.speaker.last_name}`
          : q.askerName,
        askerParty: questionRow?.speaker?.party ?? q.askerParty,
        ministerName: answerRows[0]?.speaker
          ? `${answerRows[0].speaker.first_name} ${answerRows[0].speaker.last_name}`
          : q.ministerName,
        ministerParty: answerRows[0]?.speaker?.party ?? q.ministerParty,
        questionText: questionRow?.body ? stripHtml(questionRow.body) : q.questionText,
        answerText: answerRows.map((r) => stripHtml(r.body ?? "")).filter(Boolean).join("\n\n"),
        transcriptJson: buildTranscript(questionRow, answerRows),
      });
    }
    console.log(`Enriched ${questionsWithContent.filter((q) => q.askerName).length} questions with speaker info`);

    // ── Step 4: Fetch divisions from TVFY ────────────────────────────────────
    console.log("Step 4: Fetching divisions...");
    const tvfyHouse = config.chamber === "lower" ? "representatives" : "senate";
    const divisions = await fetchDivisionsForDate(date, tvfyHouse as "representatives" | "senate");
    console.log(`Fetched ${divisions.length} divisions from They Vote For You`);

    // Get member lookup function
    const { data: members } = await db
      .from("members")
      .select("id, name_last, name_first, electorate, party_id, parties(short_name)")
      .eq("parliament_id", parliamentId);

    const memberLookup = (lastName: string, firstName: string, party: string): string | null => {
      const m = (members ?? []).find(
        (m) =>
          m.name_last.toUpperCase() === lastName.toUpperCase() &&
          (m.name_first?.toLowerCase().startsWith(firstName.toLowerCase().slice(0, 2)) ?? true)
      );
      return m?.id ?? null;
    };

    await upsertDivisions(sittingDayId, parliamentId, divisions, memberLookup, divisionTimes);

    // Generate AI summaries for divisions
    const { data: upsertedDivisions } = await db
      .from("divisions")
      .select("id, division_number, subject, result, ayes_count, noes_count, ai_summary")
      .eq("sitting_day_id", sittingDayId)
      .order("division_number");

    for (const div of upsertedDivisions ?? []) {
      const summary = await summariseDivision({
        subject: div.subject,
        result: div.result ?? "unknown",
        ayesCount: div.ayes_count ?? 0,
        noesCount: div.noes_count ?? 0,
        divisionNumber: div.division_number ?? 0,
        date,
        parliament: config.name,
      }).catch((e) => { console.warn(`Division summary failed: ${e.message}`); return null; });
      if (summary) {
        await db.from("divisions").update({ ai_summary: summary }).eq("id", div.id);
      }
    }

    // ── Step 5: Classify questions (Dorothy Dixer detection) ─────────────────
    console.log("Step 5: Classifying questions...");
    const classifiedQuestions: Array<(typeof questionsWithContent)[0] & { isDorothyDixer: boolean; askerMemberId: string | null; ministerMemberId: string | null }> = [];
    for (const q of questionsWithContent) {
      const cls = await classifyQuestion(
        q.askerName,
        q.ministerName,
        parliamentId,
        config.governmentParties,
        q.questionText
      );
      classifiedQuestions.push({ ...q, ...cls });
    }

    const realQuestions = classifiedQuestions.filter((q) => !q.isDorothyDixer);
    const dixerCount = classifiedQuestions.length - realQuestions.length;
    console.log(`Questions: ${realQuestions.length} real, ${dixerCount} Dorothy Dixers`);

    // ── Step 6: AI enrichment ─────────────────────────────────────────────────
    console.log("Step 6: AI enrichment...");

    // Sequential to avoid Claude rate limits
    const enrichedBills: Array<{ title: string; party: string | null; summary: string | null }> = [];
    for (const bill of allBills) {
      const summary = await summariseBill({
        shortTitle: bill.shortTitle,
        introducerName: bill.introducerName,
        introducerParty: null,
        introductionText: bill.introductionText,
        parliament: config.name,
        date,
      }).catch((e) => {
        console.warn(`Bill summary failed: ${e.message}`);
        return null;
      });

      const { error } = await db.from("bills").upsert(
        {
          parliament_id: parliamentId,
          sitting_day_id: sittingDayId,
          short_title: bill.shortTitle,
          long_title: bill.longTitle,
          bill_stage: bill.stage,
          ai_summary: summary,
        },
        { onConflict: "parliament_id,bill_number" }
      );
      if (error) console.warn(`Bill upsert error: ${error.message}`);
      enrichedBills.push({ title: bill.shortTitle, party: null, summary });
    }

    // Clear stale questions before re-inserting (numbering may have changed between runs)
    await db.from("questions").delete().eq("sitting_day_id", sittingDayId);

    // Sequential to avoid Claude rate limits; skip summary if no answer text available
    const enrichedQuestions: Array<{ asker: string; minister: string; subject: string | null; summary: string | null }> = [];
    for (const q of classifiedQuestions) {
      let aiSummary: string | null = null;

      if (q.answerText) {
        await new Promise((r) => setTimeout(r, 1000)); // avoid Claude rate limits
        const result = await summariseQuestion({
          askerName: q.askerName ?? "Unknown",
          askerParty: "Unknown",
          ministerName: q.ministerName ?? "Unknown",
          ministerParty: "Unknown",
          ministerRole: null,
          subject: q.subject,
          questionText: q.questionText,
          answerText: q.answerText,
        }).catch((e) => {
          console.warn(`Question summary failed: ${e.message}`);
          return null;
        });
        aiSummary = result?.summary ?? null;
      }

      const { error } = await db.from("questions").upsert(
        {
          sitting_day_id: sittingDayId,
          question_number: q.questionNumber,
          asker_id: q.askerMemberId,
          minister_id: q.ministerMemberId,
          subject: q.subject,
          question_text: q.questionText,
          answer_text: q.answerText,
          is_dorothy_dixer: q.isDorothyDixer,
          ai_summary: aiSummary,
          transcript_json: q.transcriptJson ?? null,
          asker_name: q.askerName,
          asker_party: q.askerParty ? (FEDERAL_PARTIES[q.askerParty]?.short_name ?? q.askerParty) : null,
          minister_name: q.ministerName,
          minister_party: (() => {
            // Prefer OA party string (normalised); fall back to member record party
            if (q.ministerParty) return FEDERAL_PARTIES[q.ministerParty]?.short_name ?? q.ministerParty;
            if (q.ministerMemberId) {
              const m = (members ?? []).find((m) => m.id === q.ministerMemberId);
              const party = m?.parties as unknown as { short_name: string } | null;
              return party?.short_name ?? null;
            }
            return null;
          })(),
        },
        { onConflict: "sitting_day_id,question_number" }
      );
      if (error) console.warn(`Question upsert error: ${error.message}`);
      enrichedQuestions.push({ asker: q.askerName ?? "", minister: q.ministerName ?? "", subject: q.subject, summary: aiSummary });
    }

    // ── Step 7: Daily digest ──────────────────────────────────────────────────
    console.log("Step 7: Generating daily digest...");
    const divisionSummaries = divisions.map((d) => ({
      subject: d.name,
      result: d.outcome,
      ayes: d.aye_votes,
      noes: d.no_votes,
    }));

    const digest = await summariseDay({
      date,
      parliament: config.name,
      bills: enrichedBills.filter(Boolean) as Array<{ title: string; party: string | null; summary: string | null }>,
      divisions: divisionSummaries,
      questions: enrichedQuestions.filter((q) => {
        const classified = classifiedQuestions.find(
          (c) => c.questionNumber === allQuestions.indexOf(allQuestions.find((aq) => aq.subject === q.subject)!) + 1
        );
        return !classified?.isDorothyDixer;
      }),
    }).catch((e) => {
      console.warn(`Daily digest failed: ${e.message}`);
      return { lede: "", digest: "" };
    });

    await db.from("daily_digests").upsert(
      {
        sitting_day_id: sittingDayId,
        lede: digest.lede,
        ai_summary: digest.digest,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "sitting_day_id" }
    );

    // ── Step 8: Audio pipeline ────────────────────────────────────────────────
    if (!skipAudio) {
      console.log("Step 8: Audio pipeline...");
      try {
        // 8a: Find ParlView video ID for today
        const parlviewVideo = await findParlViewVideo(date, parliamentId as "fed_hor" | "fed_sen");
        if (!parlviewVideo) {
          console.log("  No ParlView video found — skipping audio");
        } else {
          console.log(`  ParlView video: ${parlviewVideo.id} (${parlviewVideo.title})`);

          // Save parlview_id to DB
          await db.from("sitting_days").update({ parlview_id: parlviewVideo.id }).eq("id", sittingDayId);

          // 8b: Find Question Time window
          const qtOffsets = questionTimeOffsets(parlviewVideo);
          if (!qtOffsets) {
            console.log("  No Question Time segment found in ParlView metadata — skipping audio");
          } else {
            console.log(`  ParlView segments (${parlviewVideo.segments.length}): ${parlviewVideo.segments.map(s => s.segmentTitle).join(", ")}`);
          console.log(`  Question Time: ${Math.round(qtOffsets.startSec)}s → ${Math.round(qtOffsets.endSec)}s`);

            // 8c: Download Question Time audio from the correct ParlView HLS chunk.
            // The recording is split into 3 chunks of ~4 hours each.
            // QT at 2pm (Tue–Thu) is in chunk 2 (12:50pm–4:50pm); using chunk 1 would
            // seek past EOF and produce silence or corrupt audio.
            const workDir = createAudioWorkDir(date, parliamentId);
            const qtSegmentForAudio = parlviewVideo.segments.find((s) => /question time/i.test(s.segmentTitle));
            const chunks = await fetchEventChunks(parlviewVideo.id);
            const qtChunk = qtSegmentForAudio
              ? findChunkForTimecode(chunks, qtSegmentForAudio.segmentIn)
              : null;

            // Chunk-relative seek: position of QT start within the chunk file (0-based)
            const chunkStartSec = qtChunk ? timecodeToSeconds(qtChunk.fileSom) : 0;
            const qtStartWallClock = qtSegmentForAudio
              ? timecodeToSeconds(qtSegmentForAudio.segmentIn)
              : timecodeToSeconds(parlviewVideo.mediaSom) + qtOffsets.startSec;
            const qtEndWallClock = qtSegmentForAudio
              ? timecodeToSeconds(qtSegmentForAudio.segmentOut)
              : timecodeToSeconds(parlviewVideo.mediaSom) + qtOffsets.endSec;

            // Positions within the chunk file (chunk-relative, used for ffmpeg seek)
            const qtStartInChunk = qtStartWallClock - chunkStartSec;
            const qtEndInChunk = qtEndWallClock - chunkStartSec;

            const hlsUrl = qtChunk
              ? qtChunk.proxyUrl
              : `https://www.aph.gov.au/News_and_Events/Watch_Read_Listen/ParlView/video/${parlviewVideo.id}`;

            if (qtChunk) {
              console.log(`  Using chunk ${qtChunk.chunkId} (${qtChunk.fileSom}–${qtChunk.fileEom}), QT at ${Math.round(qtStartInChunk)}s in chunk`);
            } else {
              console.warn("  Could not find correct HLS chunk — falling back to ParlView page URL (seek may be wrong)");
            }

            const rawAudioPath = await downloadQuestionTimeAudio(
              hlsUrl,
              qtStartInChunk,
              qtEndInChunk,
              workDir
            );
            console.log(`  Downloaded: ${rawAudioPath}`);

            // bufferedStart is the chunk-relative position where the downloaded file starts.
            // buildEpisode converts segment positions to file-relative via: filePos = seg.startSec - bufferedStart
            const bufferedStart = Math.max(0, qtStartInChunk - 30);
            const qtDuration = qtEndInChunk - qtStartInChunk;

            const realQuestionsForAudio = classifiedQuestions.filter((q) => !q.isDorothyDixer && q.questionNumber);

            // Build member electorate lookup for AI context: member_id → electorate
            const memberElectorateMap = new Map<string, string>();
            for (const m of members ?? []) {
              if (m.electorate) memberElectorateMap.set(m.id, m.electorate);
            }

            // 8d: Fetch captions from ParlView captions API (full-day wall-clock timecodes,
            // covers QT at any time of day — no 4-hour HLS subtitle limit).
            const qtSegment = parlviewVideo.segments.find((s) => /question time/i.test(s.segmentTitle));
            let qtTranscript: string | null = null;

            if (qtSegment) {
              const parlviewCaptions = await fetchParlViewCaptions(parlviewVideo.id);
              if (parlviewCaptions.length > 0) {
                qtTranscript = buildQtTranscriptFromParlViewCaptions(
                  parlviewCaptions,
                  qtSegment.segmentIn,
                  qtSegment.segmentOut
                );
              }
            }

            if (!qtTranscript) {
              console.log("  No captions available — question timestamps will be interpolated");
            }

            // 8e: Ask Sonnet for timestamps — ALL questions (real + Dorothy Dixers).
            // Dixer timestamps are used as end boundaries for preceding real question clips.
            const allQuestionsForTimestamps = classifiedQuestions
              .filter((q) => q.questionNumber)
              .map((q) => ({
                questionNumber: q.questionNumber!,
                askerName: q.askerName ?? null,
                askerParty: q.askerParty ?? null,
                electorate: q.askerMemberId ? (memberElectorateMap.get(q.askerMemberId) ?? null) : null,
                questionText: q.questionText ?? null,
                isDorothyDixer: q.isDorothyDixer,
              }));

            const aiTimestamps = qtTranscript ? await extractTimestampsWithAI(
              qtTranscript,
              allQuestionsForTimestamps,
              config.chamber === "lower" ? "house" : "senate"
            ).catch((e) => { console.warn(`  AI timestamp extraction failed: ${e.message}`); return []; }) : [];

            console.log(`  AI identified ${aiTimestamps.length}/${allQuestionsForTimestamps.length} question timestamps`);
            for (const t of aiTimestamps) {
              const isDixer = allQuestionsForTimestamps.find(q => q.questionNumber === t.questionNumber)?.isDorothyDixer;
              console.log(`    Q${t.questionNumber}${isDixer ? " [Dixer]" : ""}: T+${t.secFromQtStart}s`);
            }

            // 8f: Map AI timestamps to chunk-relative positions.
            // All question numbers (real + Dixer), sorted, used for boundary lookup.
            const allAiMap = new Map(aiTimestamps.map((t) => [t.questionNumber, t.secFromQtStart]));
            const allQNums = allQuestionsForTimestamps.map((q) => q.questionNumber).sort((a, b) => a - b);

            // Senate captions lag behind speech more than the house, so we shift
            // AI timestamps earlier by an extra offset to compensate.
            const chamberLeadSec = config.chamber === "upper" ? 5 : 0;

            // Assign start times for real questions only (interpolate gaps)
            const assignedStartsQt = new Map<number, number>(); // qNum → secFromQtStart
            const qNums = realQuestionsForAudio.map((q) => q.questionNumber!);
            let minQtSec = 0;

            for (const q of realQuestionsForAudio) {
              const secFromQt = allAiMap.get(q.questionNumber!);
              if (secFromQt != null && secFromQt >= minQtSec && secFromQt <= qtDuration) {
                assignedStartsQt.set(q.questionNumber!, Math.max(0, secFromQt - chamberLeadSec));
                minQtSec = secFromQt + 30;
              }
            }

            // Interpolate missing real questions between known neighbours
            for (let i = 0; i < qNums.length; i++) {
              if (assignedStartsQt.has(qNums[i])) continue;

              let prevQt = 0;
              let nextQt = qtDuration;
              let gapStart = -1, gapEnd = -1;
              for (let j = i - 1; j >= 0; j--) {
                if (assignedStartsQt.has(qNums[j])) { prevQt = assignedStartsQt.get(qNums[j])!; gapStart = j; break; }
              }
              for (let j = i + 1; j < qNums.length; j++) {
                if (assignedStartsQt.has(qNums[j])) { nextQt = assignedStartsQt.get(qNums[j])!; gapEnd = j; break; }
              }

              const gapFrom = gapStart + 1;
              const gapTo = gapEnd >= 0 ? gapEnd : qNums.length;
              const gapSize = gapTo - gapFrom;
              const posInGap = i - gapFrom + 1;
              assignedStartsQt.set(qNums[i], prevQt + (nextQt - prevQt) * (posInGap / (gapSize + 1)));
            }

            // Build segments for ALL questions (real + Dorothy Dixers that have timestamps).
            // Real questions: includeInPodcast=true (clip + podcast episode)
            // Dorothy Dixers: includeInPodcast=false (clip only, not in podcast feed)
            //
            // End boundary = start of the NEXT question (any type, including Dixers).
            const segments: QuestionSegment[] = [];
            const qtStartRec = qtStartInChunk; // chunk-relative QT start (base for segment positions)
            const fmt = (s: number) => `${Math.floor(s/60)}m${Math.round(s%60)}s`;

            // Build the full ordered list: real questions (with assigned starts) + Dixers with AI timestamps
            const allSegmentInputs = allQuestionsForTimestamps
              .filter((q) => !q.isDorothyDixer ? assignedStartsQt.has(q.questionNumber) : allAiMap.has(q.questionNumber))
              .sort((a, b) => {
                const aT = !a.isDorothyDixer ? assignedStartsQt.get(a.questionNumber)! : allAiMap.get(a.questionNumber)!;
                const bT = !b.isDorothyDixer ? assignedStartsQt.get(b.questionNumber)! : allAiMap.get(b.questionNumber)!;
                return aT - bT;
              });

            for (let i = 0; i < allSegmentInputs.length; i++) {
              const q = allSegmentInputs[i];
              const secFromQtStart = !q.isDorothyDixer
                ? assignedStartsQt.get(q.questionNumber)!
                : allAiMap.get(q.questionNumber)!;

              // End = start of next segment in sorted order (any type), or end of QT
              const nextSec = i + 1 < allSegmentInputs.length
                ? (!allSegmentInputs[i + 1].isDorothyDixer
                  ? assignedStartsQt.get(allSegmentInputs[i + 1].questionNumber)!
                  : allAiMap.get(allSegmentInputs[i + 1].questionNumber)!)
                : qtDuration;

              const startSec = qtStartRec + secFromQtStart;
              const endSec = qtStartRec + nextSec;

              const qInfo = classifiedQuestions.find(cq => cq.questionNumber === q.questionNumber);
              console.log(`  Q${q.questionNumber}${q.isDorothyDixer ? " [Dixer]" : ""}: ${fmt(startSec)} → ${fmt(endSec)} (T+${Math.round(secFromQtStart)}s–T+${Math.round(nextSec)}s)`);

              segments.push({
                questionNumber: q.questionNumber,
                askerName: qInfo?.askerName ?? null,
                askerParty: qInfo?.askerParty ?? null,
                ministerName: qInfo?.ministerName ?? null,
                startSec,
                endSec,
                introClipPath: undefined,
                includeInPodcast: !q.isDorothyDixer,
              });
            }

            // 8g: Build episode — pass bufferedStart so editor can convert to file-relative
            const episodePath = `${workDir}/episode.mp3`;
            const { durationSec, clipPaths, chapterStartSecs } = await buildEpisode(
              rawAudioPath,
              bufferedStart,
              segments,
              episodePath,
              workDir
            );
            console.log(`  Episode built: ${Math.round(durationSec / 60)}min`);

            // 8h: Upload episode + chapters.json to R2
            const audioUrl = await uploadEpisode(episodePath, parliamentId, date);
            console.log(`  Uploaded episode: ${audioUrl}`);

            // Build and upload Podcast 2.0 chapters JSON (real questions only, with real timestamps)
            const siteUrl = process.env.APP_URL ?? "https://on-notice.xyz";
            const chaptersData = {
              version: "1.2.0",
              chapters: segments
                .filter((s) => s.includeInPodcast !== false && chapterStartSecs.has(s.questionNumber))
                .map((s) => {
                  const qInfo = classifiedQuestions.find((cq) => cq.questionNumber === s.questionNumber);
                  return {
                    startTime: chapterStartSecs.get(s.questionNumber)!,
                    title: qInfo?.subject
                      ? `Q${s.questionNumber}: ${qInfo.subject}`
                      : `Question ${s.questionNumber}`,
                    url: `${siteUrl}/${date}?parliament=${parliamentId}#q${s.questionNumber}`,
                  };
                }),
            };
            const chaptersFilePath = `${workDir}/chapters.json`;
            fs.writeFileSync(chaptersFilePath, JSON.stringify(chaptersData));
            await uploadChapters(chaptersFilePath, parliamentId, date);
            console.log(`  Chapters uploaded: ${chaptersData.chapters.length} chapters`);

            // Save audio URL to sitting_days
            await db.from("sitting_days").update({
              audio_url: audioUrl,
              audio_duration_sec: durationSec,
            }).eq("id", sittingDayId);

            // 8i: Upload per-question clips (real + Dorothy Dixers) and store URLs
            for (const seg of segments) {
              const clipPath = clipPaths.get(seg.questionNumber);
              if (!clipPath || !fs.existsSync(clipPath)) continue;
              try {
                const clipUrl = await uploadClip(clipPath, parliamentId, date, seg.questionNumber);
                await db.from("questions").update({ audio_clip_url: clipUrl })
                  .eq("sitting_day_id", sittingDayId)
                  .eq("question_number", seg.questionNumber);
                console.log(`  Clip uploaded: Q${seg.questionNumber}${seg.includeInPodcast === false ? " [Dixer]" : ""} → ${clipUrl}`);
              } catch (clipErr) {
                console.warn(`  Clip upload failed for Q${seg.questionNumber}: ${clipErr}`);
              }
            }
            // Keep temp dir so raw audio can be reused on the next run
            // (delete /tmp/on-notice-audio-* to force a fresh download)
          }
        }
      } catch (audioErr) {
        // Audio failure is non-fatal — text content is still complete
        const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
        console.warn(`  Audio pipeline failed (non-fatal): ${msg}`);
      }
    }

    // ── Step 9: Mark complete ─────────────────────────────────────────────────
    await db
      .from("sitting_days")
      .update({ pipeline_status: "complete" })
      .eq("id", sittingDayId);

    // Trigger Vercel ISR revalidation so the page reflects new data immediately
    const revalidateUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/revalidate`
      : process.env.APP_URL
        ? `${process.env.APP_URL}/api/revalidate`
        : null;
    const revalidateSecret = process.env.REVALIDATE_SECRET;
    if (revalidateUrl && revalidateSecret) {
      try {
        const res = await fetch(revalidateUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-revalidate-token": revalidateSecret },
          body: JSON.stringify({ date, parliament: parliamentId }),
        });
        if (res.ok) {
          console.log("  ✓ Vercel cache revalidated");
        } else {
          console.warn(`  ⚠ Revalidation returned ${res.status}`);
        }
      } catch (e) {
        console.warn(`  ⚠ Revalidation failed: ${e}`);
      }
    }

    console.log("\n✓ Pipeline complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nPipeline error: ${message}`);

    await db
      .from("sitting_days")
      .update({ pipeline_status: "error", pipeline_error: message })
      .eq("id", sittingDayId);

    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
