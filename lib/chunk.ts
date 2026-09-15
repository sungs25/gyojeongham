import type { Chunk } from '@/app/write/types';

export const MAX_CHARS = 1200;

type Span = { start: number; end: number };

// 앞뒤 공백을 오프셋에서 밀어낸다
function trimSpan(source: string, start: number, end: number): Span {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(source[s])) s += 1;
  while (e > s && /\s/.test(source[e - 1])) e -= 1;
  return { start: s, end: e };
}

// 빈 줄을 경계로 문단의 위치를 찾는다
export function findParagraphs(source: string): Span[] {
  const spans: Span[] = [];
  const re = /\n[ \t]*\n/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(source)) !== null) {
    const span = trimSpan(source, cursor, m.index);
    if (span.end > span.start) spans.push(span);
    cursor = m.index + m[0].length;
  }

  const last = trimSpan(source, cursor, source.length);
  if (last.end > last.start) spans.push(last);

  return spans;
}

// 문단을 1,200자까지 이어붙여 청크로 만든다
export function splitIntoChunks(source: string, maxChars = MAX_CHARS): Chunk[] {
  const spans: Span[] = [];
  let current: Span | null = null;

  const paragraphs = findParagraphs(source).flatMap((p) =>
  p.end - p.start > maxChars ? splitLongSpan(source, p, maxChars) : [p],
);

for (const p of paragraphs) {
    if (current && p.end - current.start <= maxChars) {
      current.end = p.end;
    } else {
      if (current) spans.push(current);
      current = { start: p.start, end: p.end };
    }
  }
  if (current) spans.push(current);

  return spans.map((span, index) => ({
    index,
    start: span.start,
    end: span.end,
    text: source.slice(span.start, span.end),
  }));
}

// 1,200자를 넘는 단일 문단을 문장 경계에서 자른다
function splitLongSpan(source: string, span: Span, maxChars: number): Span[] {
  const out: Span[] = [];
  let start = span.start;

  while (span.end - start > maxChars) {
    const slice = source.slice(start, start + maxChars);

    // 마침표·물음표·느낌표 뒤가 공백이나 끝인 지점들
    const sentences = [...slice.matchAll(/[.!?](?=["'”’)\]]?(?:\s|$))/g)];
    let cut = -1;

    if (sentences.length > 0) {
      const candidate = sentences[sentences.length - 1].index + 1;
      if (candidate > maxChars * 0.4) cut = candidate;
    }
    if (cut === -1) {
      const ws = slice.lastIndexOf(' ');
      if (ws > maxChars * 0.4) cut = ws + 1;
    }
    if (cut === -1) cut = maxChars;

    out.push(trimSpan(source, start, start + cut));
    start += cut;
  }

  const tail = trimSpan(source, start, span.end);
  if (tail.end > tail.start) out.push(tail);
  return out;
}