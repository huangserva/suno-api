import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { corsHeaders } from '@/lib/utils';
import { MvMusicTask, listMvProjectTasks, saveMvTask } from '@/lib/mvTasks';
import { refreshMvTask } from '@/lib/mvWorkflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: {
    id: string;
  };
}

const isTaskReady = (task: MvMusicTask) =>
  task.status === 'complete' &&
  task.clips.length > 0 &&
  task.clips.every(
    (clip) =>
      Boolean(clip.local_audio_url) &&
      isStableAudioSource(clip.local_audio_source_url || clip.audio_url)
  );

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

const toProjectResponse = (mvProjectId: string, tasks: MvMusicTask[]) => {
  const latestTask = tasks[0] ?? null;

  return {
    mv_project_id: mvProjectId,
    ready: latestTask ? isTaskReady(latestTask) : false,
    latest_task: latestTask,
    tasks,
    assets:
      latestTask?.clips.map((clip) => ({
        clip_id: clip.id,
        title: clip.title,
        status: clip.status,
        duration: clip.duration,
        audio_url: clip.audio_url,
        local_audio_url: clip.local_audio_url,
        local_audio_path: clip.local_audio_path,
        local_audio_source_url: clip.local_audio_source_url,
        image_url: clip.image_url,
        video_url: clip.video_url,
        lyric: clip.lyric,
        aligned_lyrics: clip.aligned_lyrics,
        asset_error: clip.asset_error,
        aligned_lyrics_error: clip.aligned_lyrics_error
      })) ?? []
  };
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get('limit') || 20);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 100)
    : 20;
  const refresh = url.searchParams.get('refresh') !== 'false';

  let tasks = await listMvProjectTasks(params.id, limit);
  if (tasks.length === 0) {
    return new NextResponse(
      JSON.stringify({ error: 'MV project task not found' }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }

  if (refresh && !isTaskReady(tasks[0]) && tasks[0].status !== 'error') {
    try {
      const refreshedTask = await refreshMvTask(
        tasks[0],
        (await cookies()).toString()
      );
      tasks = [refreshedTask, ...tasks.slice(1)];
    } catch (error: any) {
      const failedRefreshTask = await saveMvTask({
        ...tasks[0],
        updated_at: new Date().toISOString(),
        last_refresh_error: error.message || String(error)
      });
      tasks = [failedRefreshTask, ...tasks.slice(1)];
    }
  }

  return new NextResponse(JSON.stringify(toProjectResponse(params.id, tasks)), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}
