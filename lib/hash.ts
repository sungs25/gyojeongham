import { createHash } from 'node:crypto';

// 청크 지문. 글자가 하나만 달라도 완전히 다른 값이 나온다.
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}