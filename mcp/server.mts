// Suno MCP server (stdio). Thin tool layer over src/lib/SunoApi.ts — same code path as the HTTP API,
// no Next.js / Docker needed. Launch via mcp/index.mjs so cwd, .env and the @/ alias are set up first.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { z } from 'zod';
import { ensureSunoCookie, parseEnv, readEnvFile } from '../scripts/ensure-suno-cookie.mjs';
import { AudioInfo, DEFAULT_MODEL, sunoApi } from '../src/lib/SunoApi';
import { createMvTask, getMvTask, listMvTasks, MvMusicInput, MvMusicTask } from '../src/lib/mvTasks';
import { audioInfoToMvClip, refreshMvTask } from '../src/lib/mvWorkflow';

const POLL_INTERVAL_MS = 10_000;

const loadEnv = async (overrideCookie = false) => {
  const env: Map<string, string> = parseEnv(await readEnvFile());
  for (const [key, value] of env) {
    if (value && (process.env[key] === undefined || (overrideCookie && key === 'SUNO_COOKIE'))) {
      process.env[key] = value;
    }
  }
};

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
});

const fail = (error: any) => {
  const message: string = error?.message || String(error);
  const hint = /cookie|401|unauthori[sz]ed/i.test(message)
    ? ' — call suno_login to refresh the Suno login, then retry.'
    : '';
  return { isError: true, content: [{ type: 'text' as const, text: message + hint }] };
};

const run = <A,>(fn: (args: A) => Promise<unknown>) => async (args: A) => {
  try {
    return json(await fn(args));
  } catch (error) {
    return fail(error);
  }
};

// Keep the tool output small and give the agent absolute file paths it can open.
const summarizeTask = (task: MvMusicTask) => ({
  task_id: task.id,
  status: task.status,
  title: task.input.title,
  model: task.input.model,
  error: task.error || task.last_refresh_error,
  clips: task.clips.map((clip) => ({
    id: clip.id,
    status: clip.status,
    title: clip.title,
    duration: clip.duration,
    audio_url: clip.audio_url,
    local_audio_path: clip.local_audio_path ? path.resolve(clip.local_audio_path) : undefined,
    error: clip.error_message || clip.asset_error
  }))
});

const waitForTask = async (task: MvMusicTask, waitSeconds: number) => {
  const deadline = Date.now() + waitSeconds * 1000;
  let current = await refreshMvTask(task);
  while (current.status !== 'complete' && current.status !== 'error' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, deadline - Date.now())));
    current = await refreshMvTask(current);
  }
  return current;
};

const startTask = async (input: MvMusicInput, clipsPromise: Promise<AudioInfo[]>, waitSeconds: number) => {
  const audios = await clipsPromise;
  const task = await createMvTask(input, audios.map((audio) => audioInfoToMvClip(audio)));
  return summarizeTask(waitSeconds > 0 ? await waitForTask(task, waitSeconds) : task);
};

const waitSecondsSchema = z
  .number()
  .int()
  .min(0)
  .max(600)
  .default(0)
  .describe('Block up to this many seconds until audio is ready and downloaded. 0 = return immediately; then use suno_get_task. Generation usually takes 60–180 s.');

const modelSchema = z.string().optional().describe(`Suno model id. Default ${DEFAULT_MODEL}.`);

export const createServer = () => {
  const server = new McpServer({ name: 'suno', version: '1.0.0' });

  server.registerTool(
    'suno_generate_song',
    {
      title: 'Generate song (custom mode)',
      description:
        'Really generates music on Suno with your own title, style prompt and lyrics (custom mode). Suno returns 2 candidate clips; audio is downloaded to public/mv-assets/audio/. Costs credits. Write lyrics with [Verse]/[Chorus]/[Bridge]/[End] section tags on their own lines.',
      inputSchema: {
        title: z.string().describe('Song title'),
        style: z.string().describe('Style prompt: genre, mood, vocal, instruments, production, tempo. Comma separated.'),
        lyrics: z.string().optional().describe('Full lyrics with section tags. Omit for instrumental.'),
        negative_tags: z.string().optional().describe('Styles/qualities to avoid'),
        make_instrumental: z.boolean().default(false),
        model: modelSchema,
        project_id: z.string().optional().describe('Optional label to group tasks'),
        wait_seconds: waitSecondsSchema
      }
    },
    run(async (args) => {
      if (!args.lyrics && !args.make_instrumental) {
        throw new Error('lyrics is required unless make_instrumental is true');
      }
      const model = args.model || DEFAULT_MODEL;
      const input: MvMusicInput = {
        mv_project_id: args.project_id,
        title: args.title,
        style: args.style,
        lyrics: args.lyrics,
        negative_tags: args.negative_tags,
        make_instrumental: args.make_instrumental,
        model,
        include_aligned_lyrics: false
      };
      const api = await sunoApi();
      return startTask(
        input,
        api.custom_generate(args.lyrics || '', args.style, args.title, args.make_instrumental, model, false, args.negative_tags),
        args.wait_seconds
      );
    })
  );

  server.registerTool(
    'suno_generate_from_description',
    {
      title: 'Generate song from description',
      description:
        'Really generates music on Suno from a short description; Suno writes the lyrics and style itself. Less control than suno_generate_song. Costs credits.',
      inputSchema: {
        description: z.string().describe('What the song should be about and sound like'),
        make_instrumental: z.boolean().default(false),
        model: modelSchema,
        project_id: z.string().optional(),
        wait_seconds: waitSecondsSchema
      }
    },
    run(async (args) => {
      const model = args.model || DEFAULT_MODEL;
      const api = await sunoApi();
      return startTask(
        {
          mv_project_id: args.project_id,
          prompt: args.description,
          make_instrumental: args.make_instrumental,
          model,
          include_aligned_lyrics: false
        },
        api.generate(args.description, args.make_instrumental, model, false),
        args.wait_seconds
      );
    })
  );

  server.registerTool(
    'suno_extend_song',
    {
      title: 'Extend a song',
      description: 'Continue an existing Suno clip from a given second with new lyrics. Costs credits.',
      inputSchema: {
        clip_id: z.string().describe('Suno clip id to extend'),
        continue_at: z.number().describe('Second in the source clip to continue from'),
        lyrics: z.string().default(''),
        style: z.string().default(''),
        title: z.string().default(''),
        negative_tags: z.string().default(''),
        model: modelSchema,
        wait_seconds: waitSecondsSchema
      }
    },
    run(async (args) => {
      const model = args.model || DEFAULT_MODEL;
      const api = await sunoApi();
      return startTask(
        { title: args.title, lyrics: args.lyrics, style: args.style, negative_tags: args.negative_tags, model, include_aligned_lyrics: false },
        api.extendAudio(args.clip_id, args.lyrics, args.continue_at, args.style, args.negative_tags, args.title, model, false),
        args.wait_seconds
      );
    })
  );

  server.registerTool(
    'suno_get_task',
    {
      title: 'Get / wait for generation task',
      description: 'Refresh a generation task, download finished audio, and optionally wait until it is complete. Returns local file paths.',
      inputSchema: {
        task_id: z.string(),
        wait_seconds: waitSecondsSchema
      }
    },
    run(async (args) => {
      const task = await getMvTask(args.task_id);
      if (!task) throw new Error(`Task not found: ${args.task_id}`);
      return summarizeTask(await waitForTask(task, args.wait_seconds));
    })
  );

  server.registerTool(
    'suno_list_tasks',
    {
      title: 'List recent tasks',
      description: 'List recent generation tasks stored locally (shared with the HTTP API).',
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) }
    },
    run(async (args) => (await listMvTasks(args.limit)).map(summarizeTask))
  );

  server.registerTool(
    'suno_generate_lyrics',
    {
      title: 'Generate lyrics',
      description: "Ask Suno's lyrics model to write lyrics from a prompt. Free; does not make audio.",
      inputSchema: { prompt: z.string() }
    },
    run(async (args) => (await sunoApi()).generateLyrics(args.prompt))
  );

  server.registerTool(
    'suno_get_credits',
    {
      title: 'Get credits',
      description: 'Remaining Suno credits and monthly usage. Also a quick check that the login works.',
      inputSchema: {}
    },
    run(async () => (await sunoApi()).get_credits())
  );

  server.registerTool(
    'suno_login',
    {
      title: 'Log in to Suno',
      description:
        'Check the saved Suno login; if missing or expired, open a browser window on this machine for the user to log in once, then store the cookie in .env. Can take up to 5 minutes while the user logs in.',
      inputSchema: { force: z.boolean().default(false).describe('Re-login even if the current cookie works') }
    },
    run(async (args) => {
      await ensureSunoCookie({ force: args.force });
      await loadEnv(true);
      return { ok: true, message: 'Suno login is usable.' };
    })
  );

  return server;
};

await loadEnv();
await createServer().connect(new StdioServerTransport());
