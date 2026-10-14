import type { MetadataRoute } from 'next';

const BASE = 'https://gyojeongham.com';

// 검색 엔진에 알려 줄 공개 화면 목록. /sitemap.xml 주소로 내보내진다
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/refund`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}