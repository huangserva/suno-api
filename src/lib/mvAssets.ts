import { promises as fs } from 'node:fs';
import path from 'node:path';

interface DownloadedAudioAsset {
  local_audio_url: string;
  local_audio_path: string;
  audio_downloaded_at: string;
}

const assetRoot = path.join(process.cwd(), 'public', 'mv-assets');
const audioAssetDir = path.join(assetRoot, 'audio');

const sanitizeFilePart = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);

const getAudioExtension = (audioUrl: string) => {
  try {
    const extension = path.extname(new URL(audioUrl).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(extension)) {
      return extension;
    }
  } catch {
    return '.mp3';
  }

  return '.mp3';
};

export const ensureAudioAsset = async (
  taskId: string,
  clipId: string,
  audioUrl: string
): Promise<DownloadedAudioAsset> => {
  const parsedUrl = new URL(audioUrl);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Only https audio URLs are supported');
  }

  await fs.mkdir(audioAssetDir, { recursive: true });

  const extension = getAudioExtension(audioUrl);
  const fileName = `${sanitizeFilePart(taskId)}-${sanitizeFilePart(
    clipId
  )}${extension}`;
  const localAudioPath = path.join(audioAssetDir, fileName);
  const localAudioUrl = `/mv-assets/audio/${fileName}`;

  try {
    await fs.access(localAudioPath);
    return {
      local_audio_url: localAudioUrl,
      local_audio_path: path.relative(process.cwd(), localAudioPath),
      audio_downloaded_at: new Date().toISOString()
    };
  } catch {
    // Continue and download the file.
  }

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(localAudioPath, buffer);

  return {
    local_audio_url: localAudioUrl,
    local_audio_path: path.relative(process.cwd(), localAudioPath),
    audio_downloaded_at: new Date().toISOString()
  };
};
