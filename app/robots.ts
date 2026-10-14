import type { MetadataRoute } from 'next';

// 검색 로봇에게 들어와도 되는 곳과 안 되는 곳을 알려 준다. /robots.txt 주소로 내보내진다
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/account', '/credits'],
    },
    sitemap: 'https://gyojeongham.com/sitemap.xml',
  };
}