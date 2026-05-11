import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sunoApi } from '@/lib/SunoApi';
import { corsHeaders } from '@/lib/utils';
import { createMvTask, MvMusicInput } from '@/lib/mvTasks';
import { audioInfoToMvClip, refreshMvTask } from '@/lib/mvWorkflow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toOptionalString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const toBoolean = (value: unknown, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  return fallback;
};

const toLimit = (value: unknown) => {
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed)) {
    return 2;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 20);
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = toLimit(body.limit);
    const readyOnly = toBoolean(body.ready_only, false);
    const cookieHeader = (await cookies()).toString();
    const api = await sunoApi(cookieHeader);
    const latestAudios = await api.get();
    const selectedAudios = latestAudios
      .filter((audio) => {
        if (!readyOnly) {
          return true;
        }

        return (
          (audio.status === 'streaming' || audio.status === 'complete') &&
          Boolean(audio.audio_url)
        );
      })
      .slice(0, limit);

    if (selectedAudios.length === 0) {
      return new NextResponse(
        JSON.stringify({ error: 'No Suno tracks found to import' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    const input: MvMusicInput = {
      mv_project_id: toOptionalString(body.mv_project_id),
      include_aligned_lyrics: toBoolean(body.include_aligned_lyrics, false),
      metadata: {
        ...(body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? body.metadata
          : {}),
        source: 'suno_import_latest',
        imported_at: new Date().toISOString(),
        imported_limit: limit,
        ready_only: readyOnly
      }
    };

    const task = await createMvTask(
      input,
      selectedAudios.map((audio) => audioInfoToMvClip(audio))
    );
    const refreshedTask = await refreshMvTask(task, cookieHeader);

    return new NextResponse(JSON.stringify(refreshedTask), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error: any) {
    return new NextResponse(
      JSON.stringify({
        error: error.response?.data?.detail || error.message || String(error)
      }),
      {
        status: error.response?.status || 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}
