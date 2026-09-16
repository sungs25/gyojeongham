import type { Change } from '@/app/write/types';
import { buildSegments } from '@/lib/derive';
import { ruleName } from '@/lib/rules';

// <슈퍼 마리오> 같은 꺾쇠가 태그로 읽혀 사라지지 않게 바꾼다
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 빈 줄(문단 경계)은 </p><p>로, 문단 안 줄바꿈은 <br>로
function toHtml(s: string): string {
  return escapeHtml(s)
    .replace(/\n\s*\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

const DEL_STYLE = 'text-decoration:line-through;color:#8a8378;';
const INS_STYLE = 'text-decoration:underline;color:#a8791b;';

/**
 * 대조본. html은 서식 붙여넣기용, text는 메모장 등 서식 없는 곳용.
 * 서식을 버리는 프로그램(한워드 등)에서도 읽히도록 html에도 [원문→교정]을 넣는다.
 */
export function buildRedline(source: string, changes: Change[]): { html: string; text: string } {
  const segments = buildSegments(source, changes);

  const html = segments
    .map((s) =>
      s.type === 'plain'
        ? toHtml(s.text)
        : `[<s><span style="${DEL_STYLE}">${toHtml(s.change.before)}</span></s>` +
          `→<u><span style="${INS_STYLE}">${toHtml(s.change.after)}</span></u>]`,
    )
    .join('');

  const text = segments
    .map((s) => (s.type === 'plain' ? s.text : `[${s.change.before}→${s.change.after}]`))
    .join('');

  return { html: `<p>${html}</p>`, text };
}

/** 변경 목록. 적용 중인 변경만, 원문 순서대로 */
export function buildChangeList(changes: Change[]): string {
  return changes
    .filter((c) => c.applied)
    .map(
      (c, i) =>
        `${i + 1}. ${c.before} → ${c.after}\n   ${c.note} (${c.ruleIds.map(ruleName).join(' · ')})`,
    )
    .join('\n\n');
}