import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DEFAULT_MODEL, sunoApi } from '@/lib/SunoApi';
import { corsHeaders } from '@/lib/utils';
import { createMvTask, MvMusicInput } from '@/lib/mvTasks';
import { audioInfoToMvClip } from '@/lib/mvWorkflow';

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

const normalizeInput = (body: any): MvMusicInput => {
  const makeInstrumental = toBoolean(body.make_instrumental);
  const includeAlignedLyrics = toBoolean(
    body.include_aligned_lyrics,
    !makeInstrumental
  );

  return {
    mv_project_id: toOptionalString(body.mv_project_id),
    prompt: toOptionalString(body.prompt),
    lyrics: toOptionalString(body.lyrics),
    style: toOptionalString(body.style),
    tags: toOptionalString(body.tags),
    title: toOptionalString(body.title),
    make_instrumental: makeInstrumental,
    negative_tags: toOptionalString(body.negative_tags),
    model: toOptionalString(body.model) || DEFAULT_MODEL,
    include_aligned_lyrics: includeAlignedLyrics,
    metadata:
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : undefined
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = normalizeInput(body);
    const prompt = input.lyrics || input.prompt;

    if (!prompt) {
      return new NextResponse(
        JSON.stringify({ error: 'prompt or lyrics is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    const api = await sunoApi((await cookies()).toString());
    const useCustomMode = Boolean(
      input.lyrics || input.style || input.tags || input.title
    );
    const audios = useCustomMode
      ? await api.custom_generate(
          prompt,
          input.tags || input.style || '',
          input.title || input.mv_project_id || 'MV Track',
          Boolean(input.make_instrumental),
          input.model || DEFAULT_MODEL,
          false,
          input.negative_tags
        )
      : await api.generate(
          prompt,
          Boolean(input.make_instrumental),
          input.model || DEFAULT_MODEL,
          false
        );

    const task = await createMvTask(input, audios.map((audio) => audioInfoToMvClip(audio)));

    return new NextResponse(JSON.stringify(task), {
      status: 202,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error: any) {
    const message = error.response?.data?.detail || error.message || String(error);
    const requiresVerification = message.includes('Suno requires human verification');

    return new NextResponse(
      JSON.stringify({
        error: message,
        next_action: requiresVerification
          ? 'Generate the track in the normal Suno web UI, then POST /api/mv/import_latest to sync it into this project.'
          : undefined
      }),
      {
        status: requiresVerification ? 409 : error.response?.status || 500,
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
