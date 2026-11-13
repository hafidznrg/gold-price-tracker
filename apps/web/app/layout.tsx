import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import { SITE_URL } from '@/lib/site';
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/bottom-nav';
import { DataStatusChip } from '@/components/data-status-chip';
import { SiteFooter } from '@/components/site-footer';
import { SITE_NAME, SITE_TAGLINE, SiteHeader } from '@/components/site-header';
import { DEFAULT_THEME, themeInitScript } from '@/lib/theme';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

const DESCRIPTION =
  'Riwayat dan perbandingan harga emas Antam, UBS, Galeri24, dan Pegadaian beserta spot dunia. Data harian, terbuka, dan bisa diunduh.';
const HOME_TITLE = `${SITE_NAME} · ${SITE_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'id_ID',
    title: HOME_TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: HOME_TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0F1A2B' },
    { media: '(prefers-color-scheme: light)', color: '#F7F5F0' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="id"
      data-theme={DEFAULT_THEME}
      className={`${inter.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-screen flex-col max-sm:pb-[calc(64px+env(safe-area-inset-bottom))]">
        <SiteHeader status={<DataStatusChip />} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <BottomNav />
      </body>
    </html>
  );
}
