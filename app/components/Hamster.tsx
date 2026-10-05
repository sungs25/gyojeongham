import type { CSSProperties } from 'react';
import Image from 'next/image';

// 햄스터 도트 그림은 모두 31×49칸이다. scale배로 키워서 보여준다.
const W = 31;
const H = 49;

export type HamsterScene = 'ready' | 'working' | 'done' | 'seed' | 'cry';

// working은 두 장을 번갈아 보여준다 (눈동자가 왼쪽·오른쪽 종이를 오간다)
const FRAMES: Record<HamsterScene, string[]> = {
  ready: ['/hamster/ready.png'],
  working: ['/hamster/working-a.png', '/hamster/working-b.png'],
  done: ['/hamster/done.png'],
  seed: ['/hamster/seed.png'],
  cry: ['/hamster/cry.png'],
};

// 미리 받아 둘 그림 전체 (preload용)
export const HAMSTER_SRCS = Object.values(FRAMES).flat();

export function Hamster({
  scene,
  line,
  scale = 3,
  className = '',
}: {
  scene: HamsterScene;
  line?: string;
  scale?: number;
  className?: string;
}) {
  const [first, second] = FRAMES[scene];
  const width = W * scale;
  const height = H * scale;

  return (
    // 그림 크기는 CSS가 --scale(배율)로 정한다. 좁은 화면에서는 CSS가 .hamster-sprite의 --scale만 바꿔 줄인다
    <figure
      className={`hamster hamster-${scene} ${className}`}
      style={{ '--scale': scale } as CSSProperties}
    >
      <span className="hamster-sprite">
        {/* 작은 원본 그대로 보내고 CSS로 키운다 (최적화를 거치면 칸이 번진다) */}
        <Image src={first} alt="" width={width} height={height} unoptimized />
        {second && (
          <Image
            className="hamster-frame2"
            src={second}
            alt=""
            width={width}
            height={height}
            unoptimized
          />
        )}
      </span>
      {line && <figcaption className="hamster-line">{line}</figcaption>}
    </figure>
  );
}