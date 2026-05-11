# Codex Suno Workflow

This document is for Codex or other local agents working with this fork. It avoids machine-specific paths. Always run commands from the repository root, not from a fixed user directory.

## Assumptions

- You are inside this repository root. Check with `pwd` and `test -f package.json`.
- `.env` exists locally and contains `SUNO_COOKIE` and `INTERNAL_API_KEY`.
- Never print, paste, commit, or upload real `SUNO_COOKIE`, `INTERNAL_API_KEY`, `.env`, `.data`, or `public/mv-assets`.
- All `/api/*` and `/v1/*` calls require `x-api-key`.
- Default model is `chirp-fenix`.
- Suno usually returns two candidate clips for one generation request.

## Start The Local API

```bash
npm run dev:mv
```

The script validates `SUNO_COOKIE` first. If the cookie is missing or expired, it opens a project-owned login browser and writes the refreshed cookie to `.env`.

In another shell, set reusable variables:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3000}"
if [ -z "${KEY:-}" ]; then
  export KEY="$(sed -n 's/^INTERNAL_API_KEY=//p' .env | head -n 1 | tr -d "\"'")"
fi
```

Check quota:

```bash
curl -H "x-api-key: $KEY" "$BASE_URL/api/get_limit"
```

## Generate Music Through The API

Use abstract style language. Do not ask for an exact clone of a living artist or band; describe musical traits instead.

```bash
curl -X POST "$BASE_URL/api/mv/generate_music" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "mv_project_id": "mv-tang-rock-test",
    "title": "Iron Dynasty Test",
    "lyrics": "[Verse]\n长风穿过旧城墙\n战鼓在黄昏里回响\n一把火照亮沉默的山河\n我听见远方还在歌唱\n\n[Chorus]\n让铁色的梦再次滚烫\n让星河落在肩上\n穿过黑夜 穿过风霜\n我们仍向太阳生长",
    "style": "Chinese heavy metal, epic 1990s Chinese rock energy, powerful Mandarin male vocal, thick distorted electric guitars, thunderous drums, pentatonic melodies, subtle guzheng and dizi colors, heroic chorus, dramatic progressive rock arrangement, 92 bpm",
    "include_aligned_lyrics": false
  }'
```

Expected success:

- HTTP `202`
- response has `id`
- response has `suno_clip_ids`
- initial `status` may be `submitted` or `processing`

Poll the returned task id:

```bash
TASK_ID="<task-id-from-response>"

for i in $(seq 1 30); do
  curl -sS -H "x-api-key: $KEY" "$BASE_URL/api/mv/tasks/$TASK_ID"
  echo
  sleep 10
done
```

The task is ready when:

- `status` is `complete`
- each clip has `local_audio_url`

Local files are written under:

```text
public/mv-assets/audio/
```

That directory is ignored by Git.

## Generate With Reference Audio

Use this when the music should follow a local audio reference more closely than a text-only style prompt. This is an additive route; `/api/mv/generate_music` remains the text-only path.

For a standalone handoff guide, see [codex-suno-reference-audio.md](codex-suno-reference-audio.md).

`reference_audio_path` can be absolute or relative to the repository root. Supported formats include `mp3`, `wav`, `flac`, `m4a`, `aac`, `ogg`, `opus`, `webm`, and `mp4`.

```bash
curl -X POST "$BASE_URL/api/mv/reference_music" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "mv_project_id": "mv-reference-test",
    "reference_audio_path": "public/mv-assets/audio/reference.mp3",
    "reference_type": "extend",
    "title": "Reference Track Test",
    "lyrics": "[Verse]\nWrite original lyrics here\n\n[Chorus]\nWrite a strong original hook here",
    "style": "Chinese heavy rock, powerful Mandarin male vocal, dramatic guitar riffs, strong live drums, heroic chorus",
    "audio_weight": 65,
    "include_aligned_lyrics": false
  }'
```

Useful fields:

- `reference_type: "extend"` uses uploaded audio as continuation context. This is the default and usually the closest to reference audio.
- `reference_type: "cover"` uses the uploaded clip as a cover/remix reference.
- `continue_at` optionally sets the reference timestamp for extend. If omitted, the API uses about 70% of the uploaded audio duration, or 30 seconds if duration is unavailable.
- `audio_weight` accepts `0-100` or `0-1`; higher means stronger reference-audio influence.

## Stable Fallback: Import Latest Suno Tracks

If direct generation is blocked by Suno human verification, do not fight the verification flow. Ask the human to generate in the normal Suno web UI, then import the latest completed tracks:

```bash
curl -X POST "$BASE_URL/api/mv/import_latest" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "mv_project_id": "mv-001",
    "limit": 2,
    "ready_only": true
  }'
```

Expected success:

- HTTP `201`
- response `status` is `complete`
- each clip has `local_audio_url`

## Read Project-Level Result

This is the best endpoint for an MV pipeline:

```bash
curl -H "x-api-key: $KEY" "$BASE_URL/api/mv/projects/<mv_project_id>"
```

Expected useful fields:

- `ready`
- `assets[].local_audio_url`
- `assets[].duration`
- `assets[].lyric`
- `assets[].image_url`

## Troubleshooting

- `401 Unauthorized`: `$KEY` is missing or does not match `.env` `INTERNAL_API_KEY`.
- HTML response instead of JSON after adding routes: stop the dev server, remove `.next`, then run `npm run dev:mv` again.
- `Suno requires human verification`: use `/api/mv/import_latest` after the human generates in the normal Suno web UI, or explicitly configure a verification-solving service.
- `400 Something about your request isn't quite right`: check payload shape and model. This fork defaults to `chirp-fenix`.
- No imported tracks: the Suno tracks may still be generating. Retry after they complete, or set `ready_only` to `false` if you want to import incomplete clips.

## Git Safety

Before committing:

```bash
git status --short
git diff --check
```

Do not commit:

- `.env`
- `.data`
- `.next`
- `public/mv-assets`
- real cookies or API keys
