import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import { SITE_URL } from '@/lib/site';
import type { ReactNode } from 'react';
import { DataStatusChip } from '@/components/data-status-chip';
import { SiteFooter } from '@/components/site-footer';
import { SITE_NAME, SiteHeader } from '@/components/site-header';
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
  'Harga jual dan buyback emas batangan Antam, UBS, dan Galeri24 serta Tabungan Emas Pegadaian, dikumpulkan otomatis setiap hari sebagai data terbuka.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'id_ID',
    title: SITE_NAME,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: SITE_NAME, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
      <body className="flex min-h-screen flex-col">
        <SiteHeader status={<DataStatusChip />} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
