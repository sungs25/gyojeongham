import type { Chunk, Para } from '@/app/write/types';

export const MAX_CHARS = 1200;
const JOINER = '\n\n';
export function cleanSource(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/[\u200b-\u200d\ufeff]/g, '');
}

function trimSpan(source: string, start: number, end: number): Para {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(source[s])) s += 1;
  while (e > s && /\s/.test(source[e - 1])) e -= 1;
  return { start: s, end: e, text: source.slice(s, e) };
}

// 빈 줄로 문단을 나눈다. measure의 split(/\n\s*\n/) + trim()과 같은 결과를
// 내되, 원문 오프셋을 함께 들고 나온다.
export function findParagraphs(source: string): Para[] {
  const paras: Para[] = [];
  const re = /\n\s*\n/g;
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(source)) !== null) {
    const p = trimSpan(source, cursor, m.index);
    if (p.text.length > 0) paras.push(p);
    cursor = m.index + m[0].length;
  }

  const last = trimSpan(source, cursor, source.length);
  if (last.text.length > 0) paras.push(last);

  return paras;
}

// 1,200자를 넘는 단일 문단을 문장 경계에서 자른다.
// measure에는 없는 처리다. 한 문단이 5,000자인 글에서 응답이
// max_tokens를 넘기는 것을 막으려고 넣었다.
function splitLongPara(source: string, para: Para, maxChars: number): Para[] {
  const out: Para[] = [];
  let start = para.start;

  while (para.end - start > maxChars) {
    const slice = source.slice(start, start + maxChars);
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

    const piece = trimSpan(source, start, start + cut);
    if (piece.text.length > 0) out.push(piece);
    start += cut;
  }

  const tail = trimSpan(source, start, para.end);
  if (tail.text.length > 0) out.push(tail);
  return out;
}

// 문단을 MAX_CHARS까지 이어붙여 청크를 만든다.
// 길이 계산과 이음새(\n\n)를 measure의 chunk()와 똑같이 맞춘다.
export function splitIntoChunks(source: string, maxChars = MAX_CHARS): Chunk[] {
  const paras = findParagraphs(source).flatMap((p) =>
    p.text.length > maxChars ? splitLongPara(source, p, maxChars) : [p],
  );

  const groups: Para[][] = [];
  let buf: Para[] = [];
  let bufLen = 0;

  for (const p of paras) {
    if (buf.length === 0) {
      buf = [p];
      bufLen = p.text.length;
    } else if (bufLen + p.text.length + JOINER.length <= maxChars) {
      buf.push(p);
      bufLen += p.text.length + JOINER.length;
    } else {
      groups.push(buf);
      buf = [p];
      bufLen = p.text.length;
    }
  }
  if (buf.length > 0) groups.push(buf);

  return groups.map((g, index) => ({
    index,
    paras: g,
    text: g.map((p) => p.text).join(JOINER),
  }));
}