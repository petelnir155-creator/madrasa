import { NextResponse } from 'next/server';
import { handleSentences } from '@/lib/api-handlers';
import { getLLM, rateLimited } from '@/lib/llm';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(`sentence:${ip}`, 20)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const { status, json } = await handleSentences(body, () => getLLM());
  return NextResponse.json(json, { status });
}
