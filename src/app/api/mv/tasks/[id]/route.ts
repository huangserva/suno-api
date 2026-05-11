import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { corsHeaders } from '@/lib/utils';
import { getMvTask, saveMvTask } from '@/lib/mvTasks';
import { refreshMvTask } from '@/lib/mvWorkflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: {
    id: string;
  };
}

const isReadyForLocalUse = (task: Awaited<ReturnType<typeof getMvTask>>) => {
  if (!task) {
    return false;
  }

  if (task.status === 'error') {
    return true;
  }

  return (
    task.status === 'complete' &&
    task.clips.every((clip) => Boolean(clip.local_audio_url))
  );
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  const task = await getMvTask(params.id);
  if (!task) {
    return new NextResponse(JSON.stringify({ error: 'Task not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') !== 'false';

  if (!refresh || isReadyForLocalUse(task)) {
    return new NextResponse(JSON.stringify(task), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  try {
    const refreshedTask = await refreshMvTask(task, (await cookies()).toString());
    return new NextResponse(JSON.stringify(refreshedTask), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error: any) {
    const failedRefreshTask = await saveMvTask({
      ...task,
      updated_at: new Date().toISOString(),
      last_refresh_error: error.message || String(error)
    });

    return new NextResponse(JSON.stringify(failedRefreshTask), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}
