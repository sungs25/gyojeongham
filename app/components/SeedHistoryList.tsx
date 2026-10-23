import { formatDateTime } from '@/lib/purchases';
import { describeLine, formatDelta, type SeedHistoryLine } from '@/lib/seed-history';

// 씨앗 내역 한 줄씩: 무엇이 있었는지·언제, 늘거나 준 씨앗, 그 뒤 남은 씨앗. 최근 것부터 받는다
export function SeedHistoryList({ lines }: { lines: SeedHistoryLine[] }) {
  return (
    <ol className="seed-history">
      {lines.map((line) => (
        <li key={line.seq}>
          <div className="seed-history-what">
            <span>{describeLine(line)}</span>
            <time dateTime={line.at}>{formatDateTime(line.at)}</time>
          </div>
          <div className="seed-history-count">
            <strong className={line.delta < 0 ? 'minus' : undefined}>{formatDelta(line.delta)}</strong>
            <span>남은 씨앗 {line.balance}개</span>
          </div>
        </li>
      ))}
    </ol>
  );
}