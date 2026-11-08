import type { MetadataRoute } from 'next';
import { NAV_ITEMS } from '@/lib/nav';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

/** `sitemap.xml` dari navigasi utama; halaman diperbarui setiap build data. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return NAV_ITEMS.map((item) => ({
    url: `${SITE_URL}${item.href}`,
    lastModified,
    changeFrequency: 'daily',
    priority: item.href === '/' ? 1 : 0.7,
  }));
}
