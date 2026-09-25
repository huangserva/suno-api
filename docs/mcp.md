# Suno MCP Server

`mcp/` exposes this fork as an MCP server over stdio. It calls the same `src/lib/SunoApi.ts` code as the HTTP API — real Suno generation with your logged-in account, audio downloaded locally — without running Next.js or Docker.

## Setup

```bash
npm install
cp .env.example .env      # SUNO_COOKIE can stay empty; suno_login fills it
```

Claude Code picks up the project `.mcp.json` automatically when opened in this repo. For other clients (Claude Desktop, Cursor, Codex, ...) add:

```json
{
  "mcpServers": {
    "suno": {
      "command": "node",
      "args": ["/absolute/path/to/suno-api/mcp/index.mjs"]
    }
  }
}
```

The server switches to the repo root itself, so `.env`, `.data/mv-tasks.json` and `public/mv-assets/audio/` are shared with the HTTP API regardless of the client's working directory.

## Tools

| Tool | What it does | Credits |
| --- | --- | --- |
| `suno_login` | Check the saved cookie; if missing/expired, open a browser on this machine to log in once and save it to `.env` | – |
| `suno_get_credits` | Remaining credits (also a login check) | – |
| `suno_generate_song` | Custom mode: `title`, `style`, `lyrics`, `negative_tags`, `make_instrumental`, `model` | yes |
| `suno_generate_from_description` | Suno writes lyrics/style from a description | yes |
| `suno_extend_song` | Continue an existing clip from `continue_at` seconds | yes |
| `suno_get_task` | Refresh a task, download finished audio, optionally wait (`wait_seconds`) | – |
| `suno_list_tasks` | Recent tasks (shared with `/api/mv/tasks`) | – |
| `suno_generate_lyrics` | Suno's lyrics model only, no audio | – |

Generation tools return a `task_id` and two candidate clips. Pass `wait_seconds` (up to 600) to block until audio is ready, or poll with `suno_get_task`. Finished clips include an absolute `local_audio_path`.

Default model is `chirp-goose` (Suno v6 free tier); override with `SUNO_MODEL` or the `model` argument.

## Notes

- Logs go to stderr; stdout is reserved for the MCP protocol.
- Human verification: without `TWOCAPTCHA_KEY`, a generation that hits Suno's captcha fails with an explanatory error. Generate once in the Suno web app, then retry (or set `SUNO_MANUAL_VERIFICATION=true` to get a verification browser window).
- For writing good prompts, see `.claude/skills/suno-songwriter/SKILL.md`.
