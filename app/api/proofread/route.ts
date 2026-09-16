import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SYSTEM_PROMPT = readFileSync(
  path.join(process.cwd(), 'prompts', 'prompt-changes.txt'),
  'utf8',
);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const body = await request.json();
  const text = typeof body?.text === 'string' ? body.text : '';

  if (text.trim().length === 0) {
    return Response.json({ error: '빈 문단입니다' }, { status: 400 });
  }

  const params = {
    model: 'claude-opus-5',
    max_tokens: 12000,
    output_config: { effort: 'high' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: text }],
  } as unknown as Anthropic.MessageCreateParamsStreaming;

  const stream = client.messages.stream(params);
  const message = await stream.finalMessage();

  const raw = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return Response.json({ raw, usage: message.usage, stopReason: message.stop_reason });
}