# Codex Suno Reference Audio Workflow

This is the handoff note for Codex or other local agents that need to create new Suno music from a reference audio file.

## What This Does

Use `POST /api/mv/reference_music` when a local audio file should influence the generated song more strongly than a text-only prompt can.

This route is additive:

- Text-only generation remains `POST /api/mv/generate_music`.
- Reference-audio generation is `POST /api/mv/reference_music`.
- Completed files are still downloaded under `public/mv-assets/audio/`.
- Task state is still stored in `.data/mv-tasks.json`.

## Safety Rules

- Never print or commit `.env`, `SUNO_COOKIE`, `INTERNAL_API_KEY`, `.data`, or generated audio assets.
- Do not include machine-specific absolute paths in committed examples.
- Do not promise exact imitation of an artist or song. Describe style traits and create original lyrics.
- If `TWOCAPTCHA_KEY` is not configured and Suno requires verification, stop and tell the human to use normal Suno web UI, then sync with `/api/mv/import_latest`.

## Start The API

Run from the repository root:

```bash
npm run dev:mv
```

In another shell:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export KEY="$(sed -n 's/^INTERNAL_API_KEY=//p' .env | head -n 1 | tr -d "\"'")"
```

Check quota:

```bash
curl -H "x-api-key: $KEY" "$BASE_URL/api/get_limit"
```

## Input Audio

`reference_audio_path` accepts either:

- absolute local path, for example `/Users/name/Music/reference.wav`
- repository-relative path, for example `references/reference.wav`

Supported extensions:

```text
mp3, wav, flac, m4a, aac, ogg, opus, webm, mp4
```

## Recommended Request

Use `cover` when the goal is a new complete song shaped by the reference.

```bash
curl -X POST "$BASE_URL/api/mv/reference_music" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "mv_project_id": "mv-reference-demo",
    "reference_audio_path": "references/reference.wav",
    "reference_type": "cover",
    "title": "New Reference Song",
    "lyrics": "[Verse 1]\nWrite original lyrics here\n\n[Chorus]\nWrite a strong original hook here",
    "style": "emotional Mandarin pop rock, strong male vocal, memorable chorus, modern band arrangement, driving drums, cinematic MV mood",
    "audio_weight": 80,
    "include_aligned_lyrics": false
  }'
```

Expected success:

- HTTP `202`
- response has `id`
- response has `suno_clip_ids`
- response `input.metadata.reference_upload` describes how Suno analyzed the uploaded reference
- initial task `status` is usually `processing`

## Poll And Download

Set the task id returned by the previous request:

```bash
TASK_ID="<task-id-from-response>"
```

Poll until `status` is `complete`:

```bash
for i in $(seq 1 40); do
  curl -sS -H "x-api-key: $KEY" "$BASE_URL/api/mv/tasks/$TASK_ID"
  echo
  sleep 10
done
```

The task is ready when each clip has:

- `status: "complete"` or `status: "streaming"`
- `local_audio_url`
- `local_audio_path`

Use `local_audio_path` for downstream MV work.

## Parameter Choices

- `reference_type: "cover"`: best first attempt for a new full song based on the reference.
- `reference_type: "extend"`: best when continuing from the reference audio. If `continue_at` is omitted, the API uses about 70% of the uploaded audio duration, or 30 seconds if duration is unavailable.
- `audio_weight`: accepts `0-100` or `0-1`. Start at `80` when the reference should matter strongly. Lower to `50-65` if the output is too constrained.
- `style`: keep this as a musical description, not an artist clone request.
- `lyrics`: provide original lyrics. Suno may compress section spacing in the returned lyric field.

## If Generation Fails

If response is `400`:

- Check that `reference_audio_path` points to a readable file.
- Check that the file extension is supported.
- Use an absolute path temporarily if a relative path is ambiguous.

If response says Suno needs verification:

- Do not enable 2Captcha unless the human explicitly wants it.
- Ask the human to generate or upload in the normal Suno web UI.
- Then import the latest completed tracks:

```bash
curl -X POST "$BASE_URL/api/mv/import_latest" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "mv_project_id": "mv-reference-demo",
    "limit": 2,
    "ready_only": true
  }'
```

If the dev server returns HTML or `502`:

- Restart with `npm run dev:mv`.
- Retry `GET /api/get_limit`.
- Then refresh the task with `GET /api/mv/tasks/$TASK_ID`.

## Known Good Smoke Test Shape

The tested shape is:

```json
{
  "reference_type": "cover",
  "audio_weight": 80,
  "model": "chirp-fenix",
  "include_aligned_lyrics": false
}
```

Suno normally returns two candidate clips per request. Pick the better one after listening.
