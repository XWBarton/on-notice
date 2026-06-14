# @on-notice/wa-pipeline

Nightly pipeline for WA Parliament (Legislative Assembly + Council): scrapes
Questions Without Notice from Hansard, classifies Dorothy Dixers, generates AI
summaries, and builds the podcast audio. Runs on GitHub Actions
(`.github/workflows/nightly-pipeline.yml`), 6:30am AWST on sitting days.

## Syncing members (do this when WA membership changes)

**parliament.wa.gov.au blocks GitHub Actions' cloud IPs with a `403`** — a real
browser User-Agent doesn't help, it's the IP range that's blocked. So the
nightly member sync usually fails (non-fatally — it carries on with whoever is
already in the DB).

This is fine almost all the time, because the member list is **near-static** —
it only changes at an **election or by-election**. When that happens, run the
sync **locally** (a residential IP isn't blocked), and the nightly question
pipeline picks up the new members from Supabase.

```bash
cd packages/wa-pipeline
set -a; source ../../.env; set +a      # loads SUPABASE_URL + SERVICE_ROLE_KEY
npx ts-node src/index.ts --members-only
```

One run covers **both** chambers (LA + LC). Expect output like
`Scraped 59 LA + 37 LC members` / `Upserted 96 WA members`. In `--members-only`
mode a `403` is **fatal** (it throws), so if it fails you'll know — if even your
local IP gets blocked, fall back to a non-cloud AU host.

## Running the full pipeline manually

```bash
cd packages/wa-pipeline
set -a; source ../../.env; set +a
npx ts-node src/index.ts --parliament wa_la --date 2026-06-11
```

Flags: `--parliament wa_la|wa_lc`, `--date YYYY-MM-DD` (default: yesterday AWST),
`--skip-audio`, `--force` (reprocess a day already marked complete),
`--members-only` (sync members and exit).
