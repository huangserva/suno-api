import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'node:fs';
import path from 'node:path';
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

const toOptionalNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toReferenceType = (value: unknown): 'extend' | 'cover' => {
  if (value === 'cover') {
    return 'cover';
  }

  return 'extend';
};

const assertReferenceAudioFile = async (filePath: string) => {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const stat = await fs.stat(resolvedPath).catch(() => null);

  if (!stat?.isFile()) {
    throw Object.assign(new Error(`reference_audio_path is not a readable file: ${filePath}`), {
      statusCode: 400
    });
  }
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
    reference_audio_path: toOptionalString(body.reference_audio_path),
    reference_type: toReferenceType(body.reference_type),
    continue_at: toOptionalNumber(body.continue_at),
    audio_weight: toOptionalNumber(body.audio_weight),
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

    if (!input.reference_audio_path) {
      return new NextResponse(
        JSON.stringify({ error: 'reference_audio_path is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    await assertReferenceAudioFile(input.reference_audio_path);

    const api = await sunoApi((await cookies()).toString());
    const result = await api.generateReferenceAudio({
      reference_audio_path: input.reference_audio_path,
      reference_type: input.reference_type,
      prompt: input.prompt,
      lyrics: input.lyrics,
      tags: input.tags || input.style,
      title: input.title || input.mv_project_id || 'MV Reference Track',
      make_instrumental: input.make_instrumental,
      negative_tags: input.negative_tags,
      model: input.model || DEFAULT_MODEL,
      continue_at: input.continue_at,
      audio_weight: input.audio_weight,
      wait_audio: false
    });

    const taskInput: MvMusicInput = {
      ...input,
      metadata: {
        ...(input.metadata || {}),
        source: 'suno_reference_music',
        reference_upload: result.upload
      }
    };
    const task = await createMvTask(
      taskInput,
      result.clips.map((audio) => audioInfoToMvClip(audio))
    );

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
          ? 'Generate or upload in the normal Suno web UI, then POST /api/mv/import_latest to sync it into this project.'
          : undefined
      }),
      {
        status: requiresVerification ? 409 : error.statusCode || error.response?.status || 500,
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
