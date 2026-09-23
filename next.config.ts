import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // /api/proofread가 readFileSync로 읽는 프롬프트 파일을 배포 번들에 포함한다
  outputFileTracingIncludes: {
    '/api/proofread': ['./prompts/**/*'],
  },
};

export default nextConfig;