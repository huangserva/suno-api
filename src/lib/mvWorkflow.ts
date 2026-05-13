import { AudioInfo, sunoApi } from '@/lib/SunoApi';
import { ensureAudioAsset } from '@/lib/mvAssets';
import {
  inferMvTaskStatus,
  MvClipRecord,
  MvMusicTask,
  saveMvTask
} from '@/lib/mvTasks';

const isReadyForDownload = (status: string) =>
  status === 'streaming' || status === 'complete';

const isTransientAudioUrl = (audioUrl?: string) => {
  if (!audioUrl) {
    return false;
  }

  try {
    return new URL(audioUrl).hostname.includes('audiopipe');
  } catch {
    return false;
  }
};

const getDownloadAudioUrl = (clipId: string, audioUrl?: string) => {
  if (!audioUrl) {
    return undefined;
  }

  if (isTransientAudioUrl(audioUrl)) {
    return `https://cdn1.suno.ai/${clipId}.mp3`;
  }

  return audioUrl;
};

export const audioInfoToMvClip = (
  audio: AudioInfo,
  previous?: MvClipRecord
): MvClipRecord => {
  const downloadAudioUrl = getDownloadAudioUrl(audio.id, audio.audio_url);
  const previousSourceUrl =
    previous?.local_audio_source_url || previous?.audio_url;
  const canReuseLocalAudio = Boolean(
    previous?.local_audio_url &&
      previous?.local_audio_path &&
      downloadAudioUrl &&
      previousSourceUrl === downloadAudioUrl &&
      !isTransientAudioUrl(previousSourceUrl)
  );

  return {
    id: audio.id,
    status: audio.status,
    title: audio.title,
    image_url: audio.image_url,
    lyric: audio.lyric,
    audio_url: audio.audio_url,
    video_url: audio.video_url,
    created_at: audio.created_at,
    model_name: audio.model_name,
    prompt: audio.prompt,
    tags: audio.tags,
    negative_tags: audio.negative_tags,
    duration: audio.duration,
    error_message: audio.error_message,
    local_audio_url: canReuseLocalAudio ? previous?.local_audio_url : undefined,
    local_audio_path: canReuseLocalAudio ? previous?.local_audio_path : undefined,
    local_audio_source_url: canReuseLocalAudio
      ? previous?.local_audio_source_url || downloadAudioUrl
      : undefined,
    audio_downloaded_at: canReuseLocalAudio
      ? previous?.audio_downloaded_at
      : undefined,
    aligned_lyrics: previous?.aligned_lyrics,
    aligned_lyrics_error: previous?.aligned_lyrics_error
  };
};

export const refreshMvTask = async (task: MvMusicTask, cookie?: string) => {
  if (task.suno_clip_ids.length === 0) {
    return task;
  }

  const api = await sunoApi(cookie);
  const audios = await api.get(task.suno_clip_ids);
  const previousClips = new Map(task.clips.map((clip) => [clip.id, clip]));
  const clips: MvClipRecord[] = [];

  for (const audio of audios) {
    const previous = previousClips.get(audio.id);
    const clip = audioInfoToMvClip(audio, previous);

    if (
      isReadyForDownload(clip.status) &&
      !clip.local_audio_url
    ) {
      const downloadAudioUrl = getDownloadAudioUrl(clip.id, clip.audio_url);

      if (!downloadAudioUrl) {
        clips.push(clip);
        continue;
      }

      try {
        Object.assign(
          clip,
          await ensureAudioAsset(task.id, clip.id, downloadAudioUrl, {
            overwrite: Boolean(previous?.local_audio_url)
          })
        );
      } catch (error: any) {
        clip.asset_error = error?.message || String(error);
      }
    }

    if (
      isReadyForDownload(clip.status) &&
      task.input.include_aligned_lyrics &&
      !clip.aligned_lyrics
    ) {
      try {
        clip.aligned_lyrics = await api.getLyricAlignment(clip.id);
        clip.aligned_lyrics_error = undefined;
      } catch (error: any) {
        clip.aligned_lyrics_error = error?.message || String(error);
      }
    }

    clips.push(clip);
  }

  const now = new Date().toISOString();
  const nextTask: MvMusicTask = {
    ...task,
    status: inferMvTaskStatus(clips),
    updated_at: now,
    clips,
    last_refresh_error: undefined
  };

  return saveMvTask(nextTask);
};
