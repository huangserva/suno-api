import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type MvTaskStatus = 'submitted' | 'processing' | 'complete' | 'error';

export interface MvMusicInput {
  mv_project_id?: string;
  prompt?: string;
  lyrics?: string;
  style?: string;
  tags?: string;
  title?: string;
  make_instrumental?: boolean;
  negative_tags?: string;
  model?: string;
  include_aligned_lyrics?: boolean;
  reference_audio_path?: string;
  reference_type?: 'extend' | 'cover';
  continue_at?: number;
  audio_weight?: number;
  metadata?: Record<string, unknown>;
}

export interface MvClipRecord {
  id: string;
  status: string;
  title?: string;
  image_url?: string;
  lyric?: string;
  audio_url?: string;
  video_url?: string;
  created_at?: string;
  model_name?: string;
  prompt?: string;
  tags?: string;
  negative_tags?: string;
  duration?: string;
  error_message?: string;
  local_audio_url?: string;
  local_audio_path?: string;
  local_audio_source_url?: string;
  audio_downloaded_at?: string;
  asset_error?: string;
  aligned_lyrics?: unknown;
  aligned_lyrics_error?: string;
}

export interface MvMusicTask {
  id: string;
  mv_project_id?: string;
  status: MvTaskStatus;
  created_at: string;
  updated_at: string;
  input: MvMusicInput;
  suno_clip_ids: string[];
  clips: MvClipRecord[];
  error?: string;
  last_refresh_error?: string;
}

interface MvTaskStore {
  tasks: MvMusicTask[];
}

const dataDir = path.join(process.cwd(), '.data');
const taskStorePath = path.join(dataDir, 'mv-tasks.json');

let writeQueue: Promise<unknown> = Promise.resolve();

const isStableAudioSource = (audioUrl?: string) => {
  if (!audioUrl) {
    return false;
  }

  try {
    return !new URL(audioUrl).hostname.includes('audiopipe');
  } catch {
    return false;
  }
};

const ensureStore = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(taskStorePath);
  } catch {
    await fs.writeFile(taskStorePath, JSON.stringify({ tasks: [] }, null, 2));
  }
};

const readStore = async (): Promise<MvTaskStore> => {
  await ensureStore();
  const raw = await fs.readFile(taskStorePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<MvTaskStore>;
  return { tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [] };
};

const writeStore = async (store: MvTaskStore) => {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${taskStorePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2));
  await fs.rename(tempPath, taskStorePath);
};

const updateStore = async <T>(
  updater: (store: MvTaskStore) => Promise<T> | T
): Promise<T> => {
  const run = writeQueue.then(async () => {
    const store = await readStore();
    const result = await updater(store);
    await writeStore(store);
    return result;
  });

  writeQueue = run.then(
    () => undefined,
    () => undefined
  );

  return run;
};

export const inferMvTaskStatus = (clips: MvClipRecord[]): MvTaskStatus => {
  if (clips.length === 0) {
    return 'submitted';
  }

  if (clips.every((clip) => clip.status === 'error')) {
    return 'error';
  }

  const allAudioReady = clips.every((clip) => {
    const isSunoComplete =
      clip.status === 'streaming' || clip.status === 'complete';
    const localAssetReady = Boolean(clip.local_audio_url);
    const stableLocalSource = isStableAudioSource(
      clip.local_audio_source_url || clip.audio_url
    );
    return isSunoComplete && localAssetReady && stableLocalSource;
  });

  if (allAudioReady) {
    return 'complete';
  }

  return 'processing';
};

export const createMvTask = async (
  input: MvMusicInput,
  clips: MvClipRecord[]
) => {
  const now = new Date().toISOString();
  const task: MvMusicTask = {
    id: randomUUID(),
    mv_project_id: input.mv_project_id,
    status: inferMvTaskStatus(clips),
    created_at: now,
    updated_at: now,
    input,
    suno_clip_ids: clips.map((clip) => clip.id),
    clips
  };

  return updateStore((store) => {
    store.tasks.unshift(task);
    return task;
  });
};

export const saveMvTask = async (task: MvMusicTask) =>
  updateStore((store) => {
    const index = store.tasks.findIndex((candidate) => candidate.id === task.id);
    if (index >= 0) {
      store.tasks[index] = task;
    } else {
      store.tasks.unshift(task);
    }
    return task;
  });

export const getMvTask = async (id: string) => {
  const store = await readStore();
  return store.tasks.find((task) => task.id === id) ?? null;
};

export const listMvTasks = async (limit = 50) => {
  const store = await readStore();
  return store.tasks
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
};

export const listMvProjectTasks = async (mvProjectId: string, limit = 20) => {
  const store = await readStore();
  return store.tasks
    .filter((task) => task.mv_project_id === mvProjectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
};
