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

export const audioInfoToMvClip = (
  audio: AudioInfo,
  previous?: MvClipRecord
): MvClipRecord => ({
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
  local_audio_url: previous?.local_audio_url,
  local_audio_path: previous?.local_audio_path,
  audio_downloaded_at: previous?.audio_downloaded_at,
  aligned_lyrics: previous?.aligned_lyrics,
  aligned_lyrics_error: previous?.aligned_lyrics_error
});

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
      clip.audio_url &&
      !clip.local_audio_url
    ) {
      try {
        Object.assign(
          clip,
          await ensureAudioAsset(task.id, clip.id, clip.audio_url)
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
