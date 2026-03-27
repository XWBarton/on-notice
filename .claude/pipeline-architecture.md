# On Notice Pipeline Architecture - Audio/Video Download Pipeline

## Overview

The On Notice pipeline is a nightly orchestrator (runs via GitHub Actions) that processes Federal Parliament House of Representatives Question Time. It processes raw parliamentary data and produces podcast-ready audio clips with AI-powered timestamping.

**Main entry point:** `/Users/xavierbarton/Developer/on-notice/packages/pipeline/src/index.ts`

---

## Pipeline Flow (9-Step Process)

### Step 1: Member Sync (Weekly)
- **Source:** OpenAustralia API
- **Function:** `syncFederalMembers()` (fed-members.ts)
- **Purpose:** Sync member names, party affiliations, electorates to database
- **Non-fatal failure:** Logs warning, continues with existing data

### Step 2: Check for Sitting Day
- **Source:** OpenAustralia getDebates API
- **Function:** `fetchDebates(date, type)` (fed-hansard.ts)
- **Purpose:** Verify parliament is sitting, create sitting_days row
- **Output:** sitting_day_id for all subsequent steps

### Step 3: Parse Debates
- **Source:** OpenAustralia XML response (structured Hansard)
- **Function:** `parseDebates(debateData)` (hansard-xml.ts)
- **Purpose:** Extract questions, bills, divisions from XML structure
- **Enrichment:** Fetch full speech content via `fetchSpeechRows()` for each question
- **Output:** bills[], questions[], divisionTimes[]

### Step 4: Fetch Divisions from TVFY
- **Source:** They Vote For You API
- **Function:** `fetchDivisionsForDate()` (tvfy-divisions.ts)
- **Purpose:** Get division voting records and results
- **Output:** divisions[] with member votes

### Step 5: Classify Questions (Dorothy Dixer Detection)
- **Function:** `classifyQuestion()` (questions.ts)
- **Logic:**
  - Clear rule: asker.party == minister.party AND minister in government → Dorothy Dixer
  - AI fallback (Claude): Used for ambiguous cases
- **Purpose:** Filter out same-party soft-ball questions
- **Output:** classifiedQuestions[] with isDorothyDixer flag

### Step 6: AI Enrichment (Sequential)
- **Models used:** Claude Sonnet 4.6
- **Functions:**
  - `summariseBill()` → ai_summary for each bill
  - `summariseQuestion()` → ai_summary for each question (if answer text available)
  - `summariseDivision()` → ai_summary for each division
- **Rate limiting:** 1-2 second delays between calls
- **Database:** Upsert all results into bills, questions, divisions tables

### Step 7: Generate Daily Digest
- **Function:** `summariseDay()`
- **Input:** All bills, divisions, and real questions from the day
- **Output:** lede + digest text stored in daily_digests table

### Step 8: Audio Pipeline (Non-fatal)
**This is the core of your audio/video question:**

#### 8a: Find ParlView Video
- **Source:** ParlView API (via Puppeteer to intercept client-side rendering)
- **Function:** `findParlViewVideo(date, parliamentId)` (parlview.ts)
- **Method:** Uses Puppeteer to load ParlView search page + intercept API responses
- **Output:** ParlViewVideo object with:
  - `id`: Video ID
  - `segments`: Array of titled segments (e.g., "Question Time", "Suspension of Standing Orders")
  - `mediaSom`: Wall-clock SMPTE timecode of recording start (e.g., "09:59:48:17")
  - `fileSom`: Frame number of HLS file's first frame (divide by 25 for seconds)
  - `hlsUrl`: HLS m3u8 URL for streaming

#### 8b: Find Question Time Window
- **Function:** `questionTimeOffsets(parlviewVideo)`
- **Calculation:** Search segments for "Question Time" → extract segmentIn/segmentOut timecodes
  - SMPTE timecodes are wall-clock times (e.g., 14:00:22:24 = 2pm)
  - Subtract mediaSom from segment timecodes to get file-relative offsets
  - Output: { startSec, endSec } relative to recording start
- **Fallback:** If no ParlView video found → skip audio

#### 8c: Find Podcast Episode & Download Audio
**Current approach (as of March 2026):**
- **Source:** Podbean RSS feeds (official Parliament podcasts)
  - fed_hor: https://feed.podbean.com/houseofrepsau/feed.xml
  - fed_sen: https://feed.podbean.com/senateau/feed.xml
- **Function:** `findPodcastEpisode(date, chamber)` (podcast.ts)
- **Match:** Title contains date in DD/MM/YYYY format
- **Download:** `downloadPodcastAudio(audioUrl, workDir)` (downloader.ts)
  - Uses curl to download MP3 directly from CDN (no yt-dlp)
  - Caches in /tmp/on-notice-audio-{date}-{parliamentId}/
  - Reuses cache if present (speeds up iterative testing)

**Note on audio sources:** Pipeline has evolved:
- Originally: ParlView HLS stream (via yt-dlp + ffmpeg)
- Latest: Podcast RSS MP3 (simpler, no fragmentation issues)
- YouTube fallback: Available but not primary

#### 8d: Get YouTube Captions for Transcript
- **Source:** @AUSParliamentLive YouTube channel (Australian Parliament Live)
- **Function:** `findParliamentYouTubeVideo()` + `downloadYouTubeCaptions()` (youtube.ts)
- **Method:**
  - Uses yt-dlp to search channel (flat-playlist mode) for matching date + chamber keywords
  - Fetches auto-generated captions via YouTube InnerTube ANDROID client API
  - Avoids yt-dlp captions (bot detection issue)
- **Caption processing:** `buildQtTranscriptFromYouTubeCaptions()` (captions.ts)
  - Parses VTT entries from subtitle objects
  - Filters to Speaker announcement lines only (reduces ~140K tokens to ~1-2K)
  - Uses regex patterns: SPEAKER_CALL_RE, MEMBER_FOR_RE
  - Inserts time markers every 30 seconds
  - Output: Compressed transcript for Claude
- **Fallback:** If no YouTube captions → question timestamps will be interpolated

#### 8e: Extract Question Timestamps with Claude
- **Function:** `extractTimestampsWithAI()` (timestamp-questions.ts)
- **Model:** Claude Sonnet 4.6
- **Input:**
  - Filtered transcript (Speaker calls + first lines of each question + time markers)
  - List of questions with: number, askerName, askerParty, electorate, questionText snippet
- **Output:** JSON array: `[{ questionNumber, secFromQtStart }, ...]`
- **Matching logic:**
  - Primary: Search for Speaker calling "member for [electorate]" or "Senator [Name]"
  - Secondary: Search for question's opening words
  - Q1 special case: Speaker call never captured (subtitle lag) → search by opening words
  - Unknown questions: Count Speaker calls in order after last identified question
- **Max tokens:** 1024

#### 8f: Build Question Timestamp Map
Two-pass algorithm (lines 409-445 in index.ts):
1. **First pass:** Assign all valid AI timestamps (must be monotonic, within bounds)
   - Filter to timestamps that are:
     - Non-null from AI
     - >= last assigned timestamp + 30s (avoid too-tight clustering)
     - Within question time audio bounds
   - Store in assignedStarts Map

2. **Second pass:** Interpolate missing questions
   - For each question without a timestamp:
     - Find nearest assigned timestamps before and after
     - Proportionally distribute time within that gap
     - Divide gap by (gapSize + 1) to spread questions evenly
   - Ensure monotonic ordering

3. **Output:** questionStarts[], questionEnds[]
   - Start = assigned timestamp (from AI or interpolated)
   - End = start of next question, or qtAudioEnd for last

#### 8g: Build Episode (Audio Stitching)
- **Function:** `buildEpisode(rawAudioPath, downloadOffsetSec, segments, outputPath, workDir)` (editor.ts)
- **Process for each question segment:**
  1. Adjust timestamps for download offset (if buffering was added)
  2. Cut segment from raw audio: `cutSegment(rawAudioPath, relStart, relEnd, segPath)`
     - Uses ffmpeg with `-ss` (fast seek) and `-t` (duration)
     - Adds 3-second buffer before/after each clip
     - Re-encodes to 64kbps MP3
  3. If intro clip available: prepend TTS "Question N. From [Name], [Party]." intro
  4. Concatenate all parts: `concatenateAudio(parts[], episodePath, workDir)`
     - Uses ffmpeg concat demuxer with safe mode
- **Output:** episode.mp3 with duration

#### 8h: Upload to Cloudflare R2
- **Functions:**
  - `uploadEpisode()` → audio/{parliamentId}/{date}/episode.mp3
  - `uploadClip()` → audio/{parliamentId}/{date}/q{qN:02d}.mp3 (per-question)
- **Client:** AWS SDK S3Client configured for R2 endpoint
- **CDN:** Public URL via CDN_BASE (default: https://audio.onnotice.au)
- **Cache headers:** public, max-age=3600

#### 8i: Store URLs in Database
- Update sitting_days: audio_url, audio_duration_sec
- Update questions: audio_clip_url (for each question)

#### Cache Strategy
- Downloaded audio stored in `/tmp/on-notice-audio-{date}-{parliamentId}/`
- Automatically reused if present (speeds up testing/re-runs)
- User can manually delete to force fresh download
- Not cleaned up automatically (for multi-run efficiency)

### Step 9: Mark Complete & Revalidate Cache
- Update sitting_days.pipeline_status = "complete"
- Trigger Vercel ISR revalidation (if configured)

---

## Key Components & Files

### Audio Modules
| File | Purpose |
|------|---------|
| `src/audio/downloader.ts` | ParlView/YouTube HLS download, podcast MP3 download, work dir setup |
| `src/audio/captions.ts` | VTT parsing, Speaker-call filtering, transcript building |
| `src/audio/editor.ts` | Audio segment cutting, concatenation, episode building |
| `src/audio/uploader.ts` | R2 upload, CDN URL generation |
| `src/audio/tts.ts` | Amazon Polly TTS for intro clips (currently unused) |
| `src/audio/silence.ts` | Silence detection (currently unused in main pipeline) |

### Scrapers
| File | Purpose |
|------|---------|
| `src/scrapers/fed-hansard.ts` | OpenAustralia API — debates, speeches |
| `src/scrapers/fed-members.ts` | OpenAustralia API — member list sync |
| `src/scrapers/tvfy-divisions.ts` | They Vote For You API — division votes |
| `src/scrapers/parlview.ts` | ParlView API (Puppeteer + vodapi) — video metadata |
| `src/scrapers/youtube.ts` | YouTube search (yt-dlp) + InnerTube captions API |
| `src/scrapers/podcast.ts` | Podbean RSS — episode download URLs |

### Parsers
| File | Purpose |
|------|---------|
| `src/parsers/hansard-xml.ts` | Extract bills, questions, divisions from OA XML |
| `src/parsers/questions.ts` | Dorothy Dixer classification, member lookup |
| `src/parsers/transcript.ts` | Build structured transcript from speech rows |

### AI/LLM
| File | Purpose |
|------|---------|
| `src/ai/client.ts` | Anthropic SDK wrapper, retry logic, JSON parsing |
| `src/ai/timestamp-questions.ts` | Claude Sonnet call for question timestamping |
| `src/ai/detect-dorothy-dixer.ts` | Claude Haiku for ambiguous question classification |
| `src/ai/summarise-question.ts` | Claude Sonnet — Q&A summarization |
| `src/ai/summarise-bill.ts` | Claude Sonnet — bill summarization |
| `src/ai/summarise-division.ts` | Claude Sonnet — division summarization |
| `src/ai/summarise-day.ts` | Claude Sonnet — daily digest |

### Database
| File | Purpose |
|------|---------|
| `src/db/client.ts` | Supabase JS client |
| `src/db/upsert-divisions.ts` | Division and vote record upsertion |

### Configuration
| File | Purpose |
|------|---------|
| `src/config.ts` | Parliament configs, party definitions, API endpoints |

---

## Data Flow Diagram

```
OpenAustralia API (debates)
    ↓
Parse Hansard XML → questions[], bills[]
    ↓
Fetch individual speech rows
    ↓
Enrich with speaker info + full text
    ↓
AI Summarize (Claude Sonnet)
    ↓
Database: questions, bills, daily_digests
    ↓
    └─────── AUDIO PIPELINE ───────────────────────────┐
              (non-fatal if fails)                        │
                                                           │
              ParlView API (Puppeteer)                    │
              → find video ID, segments, QT window        │
                                                           │
              Podcast RSS (Podbean)                       │
              → find episode, download MP3                │
                  ↓                                        │
              YouTube @AUSParliamentLive                 │
              → find video, download captions (InnerTube) │
                  ↓                                        │
              `buildQtTranscriptFromYouTubeCaptions()`   │
              → filter Speaker calls, compress            │
                  ↓                                        │
              Claude Sonnet: extractTimestampsWithAI()   │
              → question start times (T+Xs)               │
                  ↓                                        │
              Interpolate missing timestamps              │
                  ↓                                        │
              `buildEpisode()`                            │
              → cut segments, concatenate, duration       │
                  ↓                                        │
              Upload to R2 CDN                            │
                  ↓                                        │
              Update database: audio_url, clip URLs       │
                                                           │
    └────────────────────────────────────────────────────┘
                           ↓
                  Mark complete, revalidate ISR
```

---

## Configuration & Environment

### Parliament Configs (config.ts)
```typescript
PARLIAMENTS = {
  fed_hor: { name: "House of Representatives", chamber: "lower", ... },
  fed_sen: { name: "Senate", chamber: "upper", ... },
}
```

### Required Environment Variables
- **OpenAustralia:** `OPEN_AUSTRALIA_API_KEY`
- **Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **R2 Storage:** `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - Alternative: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- **Anthropic:** `ANTHROPIC_API_KEY`
- **Vercel ISR (optional):** `VERCEL_URL` or `APP_URL`, `REVALIDATE_SECRET`

### Command-Line Arguments
```bash
ts-node src/index.ts \
  [--parliament fed_hor|fed_sen] \
  [--date YYYY-MM-DD] \
  [--skip-audio]
```

---

## Recent Changes & Evolution

### March 2026: Podcast RSS Source
- **Commit:** c7c6066 "Switch to podcast RSS for audio, YouTube page HTML for captions"
- **Before:** Downloaded audio from ParlView HLS stream via yt-dlp + ffmpeg
- **After:** Download MP3 directly from Podbean podcast RSS feeds
- **Why:** Simpler, more reliable (no HLS fragmentation), avoids yt-dlp complexity

### Timestamp Extraction Evolution
1. **Silence detection** (silence.ts) — tried but too unreliable
2. **Manual offset calculation** — tried but didn't work
3. **Current:** Claude Sonnet + Speaker-call transcript (very reliable)

### Caption Sources
1. **ParlView HLS subtitles** — limited to ~4 hours from recording start, fails for Tue–Thu QT
2. **YouTube yt-dlp --write-auto-sub** — worked but bot-detection issues
3. **YouTube InnerTube ANDROID client** — current, stable, no bot detection

---

## Known Issues & Limitations

### Audio Pipeline
1. **Subtitle lag:** Q1 Speaker call often not captured → must match by opening words
2. **Interpolation:** If AI can't find some question timestamps, they're spread proportionally
3. **Buffer padding:** 30s added to each download edge, 3s added to each clip edge

### Captions
1. YouTube auto-captions sometimes miss speakers in high-noise environment
2. Podcast RS date format matching is fragile (depends on exact DD/MM/YYYY format)

### Performance
1. Puppeteer + Podbean fetch + YouTube captions fetch + Claude calls = ~5-10 min for audio pipeline
2. All AI summarization is sequential (rate limit avoidance) = ~30-60 sec per day

---

## Testing & Debugging

### Cache Clearing
```bash
rm -rf /tmp/on-notice-audio-*
```

### Skip Audio Pipeline
```bash
ts-node src/index.ts --date 2026-03-25 --skip-audio
```

### Test Timestamp Extraction
- File: `src/test-timestamps.ts` (if exists)
- Manually call `extractTimestampsWithAI()` with known transcript

### Environment-Specific
- CI/CD: GitHub Actions (scheduled nightly)
- Local dev: Can pass --date to reprocess any sitting day

---

## Database Schema (Relevant Tables)

### sitting_days
- `id`: Primary key
- `parliament_id`, `sitting_date`: Unique constraint
- `pipeline_status`: 'running' | 'complete' | 'error'
- `pipeline_error`: Error message if failed
- `parlview_id`: Video ID from ParlView
- `audio_url`: Full episode MP3 URL
- `audio_duration_sec`: Duration in seconds

### questions
- `sitting_day_id`: Foreign key to sitting_days
- `question_number`: 1-indexed, auto-incremented per day
- `asker_id`, `minister_id`: Foreign keys to members
- `audio_clip_url`: Per-question clip URL
- `ai_summary`: Claude summary text
- `transcript_json`: Structured transcript entries

### bills, divisions, daily_digests
- Store AI summaries for each entity

---

## Dependency Summary

### NPM Packages
- `@anthropic-ai/sdk`: Claude API
- `@supabase/supabase-js`: Database
- `@aws-sdk/client-s3`: R2 upload
- `@aws-sdk/client-polly`: TTS (currently unused)
- `puppeteer`: ParlView scraping
- `cheerio`, `fast-xml-parser`: HTML/XML parsing
- `fluent-ffmpeg`: Audio cutting/concatenation (via ffmpeg binary)
- `node-fetch`: HTTP requests
- `date-fns`: Date formatting

### System Binaries (Required)
- `ffmpeg`: Audio encoding/cutting (with libmp3lame)
- `ffprobe`: Audio duration detection
- `yt-dlp`: YouTube video search
- `curl`: HTTP downloads

---

## Summary

The On Notice pipeline is a **9-step nightly ETL** that:
1. Syncs members
2. Fetches debates from OpenAustralia
3. Parses parliamentary data
4. Classifies questions (Dorothy Dixer detection)
5. Enriches with AI summaries (Claude)
6. Generates daily digest
7. **Audio pipeline (non-fatal):** Downloads question-time audio (podcast RSS), gets captions (YouTube InnerTube), aligns questions using Claude Sonnet + Speaker-call transcript, stitches clips, uploads to R2
8. Stores results in Supabase
9. Marks complete, revalidates Vercel ISR

**Key design:** Question timestamping uses Claude to identify Speaker calls in a compressed transcript, then interpolates missing questions proportionally. This is robust even with missing captions and handles subtitle lag gracefully.
