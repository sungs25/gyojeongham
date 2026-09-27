// measure 응답 원문(results/raw/<회차>/*.txt)에서 규칙별 변경 건수를 세고,
// 7번이 붙은 변경과 어휘 선택으로 보이는 변경을 모아 보여준다. API를 부르지 않는다.
// 사용: npx tsx rule-check.ts <회차 폴더 이름> [<회차 폴더 이름> ...]
import fs from "node:fs";
import path from "node:path";

type Change = { before: string; after: string; rule_id: string; note: string };

// lib/parse.ts와 같은 방식: 펜스를 벗기고, 안 되면 JSON 덩어리만 긁는다
function parse(raw: string): Change[] | null {
  let body = raw.trim();
  const fenced = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  if (fenced) body = fenced[1].trim();
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    const first = body.search(/[[{]/);
    const last = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
    if (first === -1 || last <= first) return null;
    try {
      data = JSON.parse(body.slice(first, last + 1));
    } catch {
      return null;
    }
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.changes) ? data.changes : null;
  if (!list) return null;
  return list.map((c: any) => ({
    before: String(c?.before ?? ""),
    after: String(c?.after ?? ""),
    rule_id: c?.rule_id == null ? "" : String(c.rule_id),
    note: String(c?.note ?? ""),
  }));
}

const ids = (c: Change) => (c.rule_id.match(/\d+/g) ?? []).map(Number);

// 어휘 선택으로 보이는 note. 낱말 기준 추정이라 섞여 들어오는 것이 있다
const WORD_CHOICE = /어휘|단어|낱말|문맥|어울리|맞지 않|부적절|뜻이|의미가/;

const runs = process.argv.slice(2);
if (runs.length === 0) {
  console.error("회차 폴더 이름을 하나 이상 넣으십시오");
  process.exit(1);
}

const rule7: string[] = [];
const wordChoice: string[] = [];

for (const run of runs) {
  const dir = path.join(__dirname, "results", "raw", run);
  const counts = new Map<number, number>();
  let total = 0;
  let parseFail = 0;
  let maxId = 0;

  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
    const changes = parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    if (!changes) {
      parseFail++;
      continue;
    }
    for (const c of changes) {
      total++;
      const list = ids(c);
      if (list.length === 0) counts.set(0, (counts.get(0) ?? 0) + 1);
      for (const n of new Set(list)) {
        counts.set(n, (counts.get(n) ?? 0) + 1);
        maxId = Math.max(maxId, n);
      }
      const line = `[${run.slice(0, 19)} ${f}] (${c.rule_id})\n  ${c.before}\n→ ${c.after}\n  ${c.note}\n`;
      if (list.includes(7)) rule7.push(line);
      if (WORD_CHOICE.test(c.note)) wordChoice.push(line);
    }
  }

  const byRule = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, k]) => `${n === 0 ? "없음" : n}:${k}`)
    .join("  ");
  console.log(`${run}\n  변경 ${total}건, 파싱 실패 ${parseFail}파일, 가장 큰 번호 ${maxId}\n  ${byRule}\n`);
}

console.log(`\n===== 7번이 붙은 변경 ${rule7.length}건 =====\n`);
console.log(rule7.join("\n"));
console.log(`\n===== 어휘 선택으로 보이는 변경 ${wordChoice.length}건 (note 낱말로 추정) =====\n`);
console.log(wordChoice.join("\n"));