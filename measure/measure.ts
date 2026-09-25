import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────
// 모델별 단가 (USD / 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
};

// .env 읽기 (Node는 자동으로 읽지 않는다. 추가 패키지 없이 직접 처리)
let KEY_SOURCE = "없음";
(() => {
  if (process.env.ANTHROPIC_API_KEY) KEY_SOURCE = "시스템 환경변수";
  const p = path.join(__dirname, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    if (m[1] === "ANTHROPIC_API_KEY") KEY_SOURCE = ".env";
  }
})();

// 캐시 쓰기는 입력가 x1.25, 캐시 읽기는 입력가 x0.1
let PRICE = { input: 2.0, output: 10.0, cacheWrite5m: 2.5, cacheRead: 0.2 };
const USD_KRW = 1400; // 환율. 필요하면 직접 고칠 것

// max_tokens는 사고와 본문이 나눠 쓴다. 사고 예산을 지정하면 나머지가 본문 몫이 된다.
let MAX_TOKENS = 12000;
const MAX_RETRY = 2;

// ─────────────────────────────────────────────────────────────
// 인자
// ─────────────────────────────────────────────────────────────
type Mode = "full" | "changes";

const argv = process.argv.slice(2);
const flag = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const has = (name: string) => argv.includes(`--${name}`);

const MODE = flag("mode", "full") as Mode;
const CONCURRENCY = Number(flag("concurrency", "1"));
const MAX_CHARS = Number(flag("maxChars", "1200")); // 청크 목표 크기
const USE_CACHE = !has("no-cache");
const MOCK = has("mock"); // API 호출 없이 배관만 확인
const NO_THINK = has("no-think"); // 확장 사고 끄기
const VERBOSE = has("verbose"); // 블록 구성·usage 원본 출력
// Sonnet 5는 적응형 사고가 기본(effort=high). budget_tokens는 400 오류.
// low / medium / high / xhigh / max 중 하나. 빈 값이면 모델 기본값.
const EFFORT = flag("effort", "");
const MODEL = flag("model", "claude-sonnet-5");
const ONLY = flag("only", ""); // 특정 파일만

// changes 모드는 서비스와 같은 파일(prompts/prompt-changes.txt)을 읽는다. 사본을 두지 않는다
const PROMPT_PATH =
  MODE === "full"
    ? path.join(__dirname, "prompt-full.txt")
    : path.join(__dirname, "..", "prompts", "prompt-changes.txt");
const SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, "utf-8");

if (!MOCK) {
  const k = process.env.ANTHROPIC_API_KEY ?? "";
  if (!k) {
    console.error(
      "ANTHROPIC_API_KEY가 없습니다.\n" +
        "이 폴더에 .env 파일을 만들고 아래 한 줄을 넣으십시오.\n" +
        "  ANTHROPIC_API_KEY=sk-ant-...\n" +
        "키 없이 배관만 보려면: npm run smoke"
    );
    process.exit(1);
  }
  const bad = [...k].filter((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126);
  console.log(
    `키 확인 — 출처: ${KEY_SOURCE} / 길이: ${k.length}자 / 앞: ${k.slice(0, 14)} / 뒤: ${k.slice(-4)}` +
      (bad.length ? ` / ⚠ 이상한 문자 ${bad.length}개 섞임` : "")
  );
  if (!k.startsWith("sk-ant-")) console.log("⚠ sk-ant- 로 시작하지 않습니다.");
  if (k.length < 90) console.log("⚠ 길이가 짧습니다. 복사할 때 잘렸을 가능성이 큽니다.");
}

MAX_TOKENS = Number(flag("max-tokens", String(MAX_TOKENS)));
if (!PRICING[MODEL]) {
  console.error(`단가를 모르는 모델입니다: ${MODEL}\n아는 모델: ${Object.keys(PRICING).join(" / ")}`);
  process.exit(1);
}
PRICE = {
  input: PRICING[MODEL].input,
  output: PRICING[MODEL].output,
  cacheWrite5m: PRICING[MODEL].input * 1.25,
  cacheRead: PRICING[MODEL].input * 0.1,
};
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];
if (EFFORT && !EFFORT_LEVELS.includes(EFFORT)) {
  console.error(`--effort 값은 ${EFFORT_LEVELS.join(" / ")} 중 하나여야 합니다. 받은 값: ${EFFORT}`);
  process.exit(1);
}

const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const RUN_TAG = `${RUN_STAMP}_${MODEL.replace("claude-", "")}_${MODE}${NO_THINK ? "_nothink" : EFFORT ? `_${EFFORT}` : "_default"}${USE_CACHE ? "" : "_nocache"}_c${CONCURRENCY}`;

let FIRST_ERROR_SHOWN = false;

const client = new Anthropic();

// ─────────────────────────────────────────────────────────────
// 문단 분할 → 청크
// 빈 줄로 문단을 나누되, 짧은 문단은 MAX_CHARS까지 이어 붙인다.
// 실제 서비스가 할 분할과 같은 방식이어야 측정값이 의미가 있다.
// ─────────────────────────────────────────────────────────────
function chunk(text: string, maxChars: number): string[] {
  const paras = text
    .replace(/\r\n/g, "\n")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (!buf) {
      buf = p;
    } else if (buf.length + p.length + 2 <= maxChars) {
      buf += "\n\n" + p;
    } else {
      out.push(buf);
      buf = p;
    }
  }
  if (buf) out.push(buf);
  return out;
}

// ─────────────────────────────────────────────────────────────
// 한 청크 처리
// ─────────────────────────────────────────────────────────────
type Row = {
  file: string;
  chunkIdx: number;
  chars: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  ttftMs: number;
  elapsedMs: number;
  parseOk: number;
  changeCount: number;
  beforeMatch: number; // before 문자열이 원문에 있던 비율 (0~1). full 모드에서도 검사
  retries: number;
  rateLimited: number;
  stopReason: string;
  thinkChars: number;
  rawChars: number;
  error: string;
};

function mockRun(text: string): { raw: string; usage: any; ttft: number; elapsed: number; stopReason: string } {
  const inTok = Math.round(text.length * 1.3) + 1600;
  const outTok = MODE === "full" ? Math.round(text.length * 1.4) : Math.round(text.length * 0.35);
  const changes = [
    { before: text.slice(0, 12), after: "고친 말", rule_id: "11", note: "완곡 표현" },
  ];
  const body: any = { changes };
  if (MODE === "full") body.result = text;
  return {
    raw: JSON.stringify(body),
    usage: {
      input_tokens: USE_CACHE ? inTok - 1600 : inTok,
      output_tokens: outTok,
      cache_creation_input_tokens: USE_CACHE ? 1600 : 0,
      cache_read_input_tokens: 0,
    },
    stopReason: "end_turn",
    ttft: 900,
    elapsed: 1500,
  };
}

async function runChunk(file: string, idx: number, text: string): Promise<Row> {
  const row: Row = {
    file,
    chunkIdx: idx,
    chars: text.length,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    ttftMs: 0,
    elapsedMs: 0,
    parseOk: 0,
    changeCount: 0,
    beforeMatch: 0,
    retries: 0,
    rateLimited: 0,
    stopReason: "",
    thinkChars: 0,
    rawChars: 0,
    error: "",
  };

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const t0 = Date.now();
      let ttft = 0;
      let raw = "";
      let usage: any;
      let stopReason = "";

      if (MOCK) {
        const m = mockRun(text);
        await new Promise((r) => setTimeout(r, m.elapsed));
        raw = m.raw;
        usage = m.usage;
        ttft = m.ttft;
        stopReason = m.stopReason;
      } else {
        console.log('입력 길이', text.length, '| 앞 40자', JSON.stringify(text.slice(0, 40)));
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [
            USE_CACHE
              ? { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
              : { type: "text", text: SYSTEM_PROMPT },
          ] as any,
          messages: [{ role: "user", content: text }],
          ...(NO_THINK ? { thinking: { type: "disabled" } } : {}),
          ...(EFFORT ? { output_config: { effort: EFFORT } } : {}),
        } as any);
        stream.on("text", () => {
          if (!ttft) ttft = Date.now() - t0;
        });
        const final = await stream.finalMessage();
        raw = final.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
        usage = final.usage;
        stopReason = final.stop_reason ?? "";
        row.thinkChars = usage?.output_tokens_details?.thinking_tokens ?? 0;
        // 블록 구성과 usage 원본 (--verbose)
        const blocks = final.content
          .map((b: any) => `${b.type}:${b.type === "text" ? b.text.length : JSON.stringify(b).length}자`)
          .join("  ");
        if (VERBOSE) console.log(
          `\n  [${file} #${idx}] 블록 → ${blocks}\n` +
            `  stop_reason → ${stopReason}\n` +
            `  usage → ${JSON.stringify(final.usage)}`
        );
      }

      row.stopReason = stopReason;
      // 응답 원문 저장 — 무엇을 뱉었는지 눈으로 확인하기 위함
      const rawDir = path.join(__dirname, "results", "raw", RUN_TAG);
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(
        path.join(rawDir, `${file.replace(/\.txt$/, "")}_${String(idx).padStart(2, "0")}.txt`),
        raw
      );

      row.rawChars = raw.length;
      row.elapsedMs = Date.now() - t0;
      row.ttftMs = ttft;
      row.inputTokens = usage.input_tokens ?? 0;
      row.outputTokens = usage.output_tokens ?? 0;
      row.cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
      row.cacheReadTokens = usage.cache_read_input_tokens ?? 0;

      // JSON 파싱 성공률 + before 매칭률
      try {
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
        row.parseOk = 1;
        row.changeCount = changes.length;
        if (changes.length) {
          const hit = changes.filter(
            (c: any) => typeof c.before === "string" && text.includes(c.before)
          ).length;
          row.beforeMatch = hit / changes.length;
        } else {
          row.beforeMatch = 1;
        }
      } catch {
        row.parseOk = 0;
        row.beforeMatch = -1;
        row.error =
          raw.length === 0
            ? "본문 0자(사고가 예산 소진)"
            : stopReason === "max_tokens"
              ? "truncated(max_tokens)"
              : "parse_fail";
      }
      return row;
    } catch (e: any) {
      const status = e?.status ?? 0;
      if (!FIRST_ERROR_SHOWN) {
        FIRST_ERROR_SHOWN = true;
        console.error(
          `\n❌ 요청 실패 (status ${status})\n` +
            `${JSON.stringify(e?.error ?? e?.message ?? String(e), null, 2)}\n`
        );
      }
      if (status === 429) row.rateLimited++;
      row.retries++;
      row.error = `${status || "err"}:${String(e?.message ?? e).slice(0, 60)}`;
      if (attempt === MAX_RETRY) return row;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return row;
}

// ─────────────────────────────────────────────────────────────
// 동시성 풀
// ─────────────────────────────────────────────────────────────
async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ─────────────────────────────────────────────────────────────
// 원가 계산
// ─────────────────────────────────────────────────────────────
function costUsd(r: {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}) {
  return (
    (r.inputTokens * PRICE.input +
      r.outputTokens * PRICE.output +
      r.cacheWriteTokens * PRICE.cacheWrite5m +
      r.cacheReadTokens * PRICE.cacheRead) /
    1_000_000
  );
}

function tier(chars: number) {
  if (chars <= 1500) return "1토큰(~1,500자)";
  if (chars <= 4000) return "2토큰(~4,000자)";
  if (chars <= 10000) return "4토큰(~10,000자)";
  if (chars <= 25000) return "8토큰(~25,000자)";
  return "구간초과";
}
const TIER_PRICE: Record<string, number> = {
  "1토큰(~1,500자)": 990,
  "2토큰(~4,000자)": 1980,
  "4토큰(~10,000자)": 3960,
  "8토큰(~25,000자)": 7920,
};

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
async function main() {
  const dir = path.join(__dirname, "texts");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(__dirname, "results"), { recursive: true });
  let files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
  if (ONLY) files = files.filter((f) => f.includes(ONLY));
  if (!files.length) {
    console.error(`texts/ 에 .txt 파일이 없습니다. 검증에 쓴 글을 넣고 다시 실행하십시오.`);
    process.exit(1);
  }

  // ② 프롬프트가 캐시 최소 길이(Sonnet 5 = 1,024토큰)를 넘는지
  if (!MOCK) {
    const ct = await client.messages.countTokens({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: "x" }],
    });
    const ok = ct.input_tokens >= 1024;
    console.log(
      `프롬프트 토큰: ${ct.input_tokens} → 캐시 최소 길이 1,024 ${ok ? "충족" : "미달(캐싱 안 걸림)"}`
    );
  }

  console.log(
    `model=${MODEL} mode=${MODE} concurrency=${CONCURRENCY} maxChars=${MAX_CHARS} cache=${USE_CACHE} ` +
      `max_tokens=${MAX_TOKENS} 사고=${NO_THINK ? "끔" : EFFORT ? `effort ${EFFORT}` : "기본값(high)"} mock=${MOCK}\n`
  );

  const allRows: Row[] = [];
  const perFile: any[] = [];

  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf-8");
    const chunks = chunk(text, MAX_CHARS);
    process.stdout.write(`${f} (${text.length}자, 청크 ${chunks.length}) ... `);

    const t0 = Date.now();
    const rows = await pool(chunks, CONCURRENCY, (c, i) => runChunk(f, i, c));
    const wallMs = Date.now() - t0;

    allRows.push(...rows);

    const sum = rows.reduce(
      (a, r) => ({
        inputTokens: a.inputTokens + r.inputTokens,
        outputTokens: a.outputTokens + r.outputTokens,
        cacheWriteTokens: a.cacheWriteTokens + r.cacheWriteTokens,
        cacheReadTokens: a.cacheReadTokens + r.cacheReadTokens,
      }),
      { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }
    );
    const usd = costUsd(sum);
    const krw = usd * USD_KRW;
    const t = tier(text.length);
    const sell = TIER_PRICE[t] ?? 0;

    perFile.push({
      file: f,
      chars: text.length,
      chunks: chunks.length,
      ...sum,
      parseFail: rows.filter((r) => !r.parseOk).length,
      firstError: rows.find((r) => r.error)?.error ?? "",
      beforeMatch: (() => {
        const ok = rows.filter((r) => r.parseOk);
        return ok.length ? ok.reduce((a, r) => a + r.beforeMatch, 0) / ok.length : -1;
      })(),
      truncated: rows.filter((r) => r.stopReason === "max_tokens").length,
      emptyText: rows.filter((r) => r.rawChars === 0).length,
      thinkChars: rows.reduce((a, r) => a + r.thinkChars, 0),
      rawChars: rows.reduce((a, r) => a + r.rawChars, 0),
      rateLimited: rows.reduce((a, r) => a + r.rateLimited, 0),
      wallSec: +(wallMs / 1000).toFixed(1),
      chunkSecAvg: +(rows.reduce((a, r) => a + r.elapsedMs, 0) / rows.length / 1000).toFixed(1),
      ttftSecAvg: +(rows.reduce((a, r) => a + r.ttftMs, 0) / rows.length / 1000).toFixed(1),
      usd: +usd.toFixed(4),
      krw: Math.round(krw),
      tier: t,
      sell,
      margin: sell ? Math.round(sell - krw) : 0,
    });
    console.log(`${(wallMs / 1000).toFixed(1)}초, ${Math.round(krw)}원`);
  }

  // CSV 저장
  const base = `results/${RUN_TAG}`;
  const toCsv = (rows: any[]) => {
    if (!rows.length) return "";
    const keys = Object.keys(rows[0]);
    return [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(",")),
    ].join("\n");
  };
  fs.writeFileSync(path.join(__dirname, `${base}_chunks.csv`), toCsv(allRows));
  fs.writeFileSync(path.join(__dirname, `${base}_files.csv`), toCsv(perFile));

  // 요약
  console.log("\n── 글별 ──");
  console.table(
    perFile.map((p) => ({
      글: p.file,
      자수: p.chars,
      구간: p.tier,
      입력: p.inputTokens,
      출력: p.outputTokens,
      캐시읽기: p.cacheReadTokens,
      "응답글자수": p.rawChars,
      "사고토큰": p.thinkChars,
      "사고비율": p.outputTokens ? Math.round((p.thinkChars / p.outputTokens) * 100) + "%" : "-",
      "원가(원)": p.krw,
      "판매가(원)": p.sell,
      "마진(원)": p.margin,
      "총소요(초)": p.wallSec,
      "청크평균(초)": p.chunkSecAvg,
      "첫글자(초)": p.ttftSecAvg,
      잘림: p.truncated,
      "본문0자": p.emptyText,
      파싱실패: p.parseFail,
      before매칭: +p.beforeMatch.toFixed(2),
      "429회": p.rateLimited,
      오류: p.firstError.slice(0, 40),
    }))
  );

  const totUsd = perFile.reduce((a, p) => a + p.usd, 0);
  console.log(
    `\n합계 $${totUsd.toFixed(4)} (${Math.round(totUsd * USD_KRW)}원)\n` +
      `CSV → ${base}_*.csv\n` +
      `응답 원문 → results/raw/${RUN_TAG}/`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
