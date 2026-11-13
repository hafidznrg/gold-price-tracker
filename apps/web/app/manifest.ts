import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_TAGLINE } from '@/components/site-header';

export const dynamic = 'force-static';

/** Manifest PWA (design system Momen Emas, D-51): ikon selalu navy, warna latar = tema terang. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: '/',
    display: 'standalone',
    lang: 'id',
    theme_color: '#F7F5F0',
    background_color: '#F7F5F0',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/brand/momen-emas-app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
