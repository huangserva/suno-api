---
name: suno-songwriter
description: Write a Suno v6 song (title, style prompt, negative prompt, structured lyrics) and actually generate it through this repo's `suno` MCP tools or the local suno-api HTTP server. Use when the user asks to make, write, compose or generate a song / music / BGM / MV track with Suno.
---

# Suno Songwriter (v6)

This skill does two things: **writes a good prompt** (the part that decides quality) and **sends it to the local suno-api**, which really calls Suno and downloads audio. It is not a "prompt only" helper.

Default model is `chirp-goose` (Suno v6, free tier). Override per request with `"model"` or globally with `SUNO_MODEL` in `.env`.

## 0. Preconditions

**If the `suno` MCP tools are available (`suno_generate_song`, `suno_get_task`, ...), use them and skip the curl steps below**: `suno_get_credits` to check login/credits (`suno_login` if it fails), write the fields per section 2, call `suno_generate_song` with `wait_seconds: 240`, and report the returned `local_audio_path`s. See `docs/mcp.md`.

Otherwise use the HTTP API:


- Run from repo root. The API must be running: `docker compose up -d` or `npm run dev:mv`.
- `.env` has `SUNO_COOKIE` and `INTERNAL_API_KEY`. The user logs in to suno.com once; `npm run dev:mv` refreshes the cookie via a login browser if it expired.
- Never print or commit `SUNO_COOKIE`, `INTERNAL_API_KEY`, `.env`, `.data`, `public/mv-assets`.

```bash
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export KEY="${KEY:-$(sed -n 's/^INTERNAL_API_KEY=//p' .env | head -n1 | tr -d "\"'")}"
curl -sS -H "x-api-key: $KEY" "$BASE_URL/api/get_limit"   # check credits first
```

## 1. Clarify the brief (ask only what is missing)

Language, genre/mood, vocal (male/female/duet/instrumental), rough length, purpose (MV, BGM, gift...), any reference track. If the user gave enough, don't ask — write.

## 2. Write the four fields

Suno custom mode has separate fields. Keep them separate; don't stuff everything into lyrics.

### Title
Short, evocative, ≤ 80 chars.

### Style prompt (`style` / `tags`)
Comma-separated descriptors, most important first. v6 understands natural musical language well, so be concrete rather than listing many genres. Cover, in order:

1. Genre + sub-genre + era (1–2 genres max; more makes it mushy)
2. Mood / energy arc (e.g. "restrained verses, explosive chorus")
3. Vocal: gender, timbre, delivery, language ("warm breathy Mandarin female vocal, belted chorus")
4. Key instruments and their role ("fingerpicked nylon guitar, sub bass, brushed drums")
5. Production / mix ("wide stereo, dry intimate vocal, analog warmth")
6. Tempo / key if it matters ("92 BPM", "G major")

Aim for roughly 20–60 words. Do **not** name living artists or ask for a copy of a specific song — describe their traits instead (Suno rejects or ignores artist names).

### Negative prompt (`negative_tags`)
Things to avoid: `lo-fi, muffled vocal, off-key, robotic vocal, long intro, spoken word, generic stock music`. Add genre-specific drift (e.g. "EDM drop" for a folk song).

### Lyrics (`lyrics` / `prompt`)
Use bracketed section tags on their own line; Suno treats bracket text as instructions, not sung words.

```
[Intro]
[Verse 1]
...4–8 lines...
[Pre-Chorus]
...
[Chorus]
...hook repeated, 4–6 lines...
[Verse 2]
[Chorus]
[Bridge]
[Final Chorus]
[Outro]
[End]
```

Rules that matter:
- Short, singable lines with consistent syllable counts inside a section; rhyme at line ends.
- The chorus hook should be repeated verbatim — repetition is what makes it land.
- Performance cues in tags: `[Chorus - powerful, full band]`, `[Verse - whispered]`, `[Instrumental Break]`, `[Guitar Solo]`, `[Build]`, `[Drop]`, `[Fade Out]`.
- Ad-libs / backing vocals in parentheses: `(oh-oh)`, `(hold on)`.
- Total ~150–350 words for a 2.5–4 min song. Too long gets cut or rushed.
- `[End]` helps stop the song cleanly instead of rambling.
- Instrumental: set `make_instrumental: true` and put structure only (`[Intro] [Main Theme] [Bridge] [Outro]`) or leave lyrics empty.
- Chinese lyrics: keep lines 7–12 characters, avoid rare characters / polyphones that get mispronounced; you can write the pinyin-safe synonym instead.

Show the user the four fields before generating if they are iterating on wording; generate directly if they said "just make it".

## 3. Generate

Text-only (recommended path — downloads audio locally and tracks the task):

```bash
curl -sS -X POST "$BASE_URL/api/mv/generate_music" \
  -H "Content-Type: application/json" -H "x-api-key: $KEY" \
  -d @- <<'JSON'
{
  "mv_project_id": "my-song",
  "title": "...",
  "style": "...",
  "negative_tags": "...",
  "lyrics": "[Verse 1]\n...\n\n[Chorus]\n...",
  "make_instrumental": false
}
JSON
```

Build the JSON with a quoted heredoc or `jq -n --arg` so quotes/newlines in lyrics don't break it.

Returns `202` with `id` and `suno_clip_ids` (Suno makes 2 candidates). Poll:

```bash
curl -sS -H "x-api-key: $KEY" "$BASE_URL/api/mv/tasks/$TASK_ID"
```

Done when `status` is `complete` and each clip has `local_audio_url` (files under `public/mv-assets/audio/`). Usually 1–3 minutes; poll every ~10 s.

Other routes:
- Plain API: `POST /api/custom_generate` `{prompt, tags, title, negative_tags, make_instrumental, model, wait_audio}`; `POST /api/generate` `{prompt, make_instrumental}` for description-only mode (Suno writes the lyrics).
- Reference audio (cover / extend a local file): `POST /api/mv/reference_music` — see `docs/codex-suno-reference-audio.md`.
- Extend: `POST /api/extend_audio` `{audio_id, prompt, continue_at, tags}`.
- Lyrics only: `POST /api/generate_lyrics` `{prompt}`.

## 4. Errors

- `401` from this API: wrong `x-api-key`.
- Cookie expired / 401 from Suno: re-run `npm run dev:mv` and log in again.
- Human verification required (no `TWOCAPTCHA_KEY`): tell the user to generate once in the Suno web UI, then `POST /api/mv/import_latest` to sync.
- `400 Something about your request isn't quite right`: check payload shape, and that the account can use the model — try `"model"` of another id or unset `SUNO_MODEL`.
- Out of credits: `/api/get_limit` shows `credits_left`.

## 5. Iterate

Listen / ask which of the 2 clips is closer, then change **one thing at a time**: style wording for sound, section tags for structure, negative prompt for drift. Save recipes that work in `docs/suno-style-recipes.md`.
