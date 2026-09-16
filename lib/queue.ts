// items를 limit개씩 동시에 처리한다. 하나가 끝나면 다음 것이 그 자리로 들어간다.
export async function runQueue<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;

  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(lanes);
}