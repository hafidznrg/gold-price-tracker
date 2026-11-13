import { SCHEMA_VERSION } from '@gold/schema';
import Link from 'next/link';
import { BrandMark, Wordmark } from '@/components/brand-mark';
import { SITE_NAME, SITE_TAGLINE } from '@/components/site-header';
import { formatJakartaStamp } from '@/lib/format';
import { NAV_ITEMS } from '@/lib/nav';

export const REPO_URL = 'https://github.com/hafidznrg/gold-price-tracker';

const HEADING = 'm-0 text-2xs font-semibold tracking-[.14em] text-faint uppercase';

const SOURCES: { title: string; items: string[] }[] = [
  {
    title: 'Harga emas Indonesia',
    items: [
      'Logam Mulia (Antam)',
      'UBS Lifestyle',
      'Pegadaian: Antam, UBS, Galeri24, Tabungan Emas',
    ],
  },
  {
    title: 'Pembanding dunia dan kurs',
    items: [
      'xaus.com (futures GC=F, spot gold-api.com)',
      'Bank Indonesia JISDOR',
      'ECB via Frankfurter',
      'World Bank Pink Sheet dan WDI',
    ],
  },
];

const NOTES = [
  'Bukan rekomendasi investasi.',
  'Harga buyback belum memperhitungkan PPh 22 yang dapat dipotong saat menjual kembali sesuai ketentuan pajak yang berlaku.',
  'Harga jual Logam Mulia adalah Harga Dasar, belum termasuk PPh 0,25%.',
  'Harga emas dunia bersifat indikatif, bukan patokan LBMA.',
];

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="flex-none">
      <path
        fill="currentColor"
        d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
      />
    </svg>
  );
}

/**
 * Footer situs (D-57): merek + tautan repo, tautan halaman, sumber data per kelompok, dan catatan
 * disclaimer + PPh 22 (FR-26). Desktop 4 kolom, tablet 2×2, HP bertumpuk.
 */
export function SiteFooter({ builtAt = new Date() }: { builtAt?: Date }) {
  return (
    <footer className="mt-10 border-t border-line bg-surface">
      <div className="wrap grid gap-x-10 gap-y-9 pt-12 pb-10 max-sm:gap-y-8 max-sm:pt-9 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-x-12">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Link
            href="/"
            aria-label={`${SITE_NAME}, ke beranda`}
            className="flex w-fit items-center gap-2.5 text-text no-underline"
          >
            <BrandMark id="me-logo-f" height={26} />
            <Wordmark className="text-[22px]" />
          </Link>
          <p className="serif m-0 text-lg leading-snug text-gold italic">{SITE_TAGLINE}</p>
          <p className="m-0 max-w-[44ch] text-sm leading-[1.65] text-muted">
            Proyek non-komersial. Data dikumpulkan otomatis setiap hari oleh GitHub Actions,
            divalidasi, dan disimpan sebagai CSV di repositori publik.
          </p>
          <a
            href={REPO_URL}
            className="mt-1 inline-flex min-h-10 w-fit items-center gap-2 rounded-control border border-line bg-surface2 px-3.5 text-sm font-semibold text-text no-underline transition-colors hover:border-goldline hover:text-gold"
          >
            <GithubIcon />
            hafidznrg/gold-price-tracker
          </a>
        </div>

        <nav aria-label="Halaman" className="flex min-w-0 flex-col gap-3">
          <h2 className={HEADING}>Jelajahi</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0 lg:grid-cols-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-8 items-center text-sm text-muted no-underline transition-colors hover:text-gold"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-3">
          <h2 className={HEADING}>Sumber data</h2>
          {SOURCES.map((g) => (
            <div key={g.title} className="flex flex-col gap-1.5">
              <h3 className="m-0 text-xs font-semibold text-text">{g.title}</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm leading-snug text-muted">
                {g.items.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] size-1 flex-none rounded-full bg-goldline"
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <h2 className={HEADING}>Catatan</h2>
          <div className="rounded-card border border-line bg-surface2 p-4">
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm leading-[1.55] text-muted">
              {NOTES.map((n, i) => (
                <li key={n} className={i === 0 ? 'font-semibold text-text' : undefined}>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 py-5 text-xs text-faint">
          <span>
            © {builtAt.getFullYear()} {SITE_NAME} · Kode MIT ·{' '}
            <span className="whitespace-nowrap">Data milik masing-masing penerbit</span>
          </span>
          <span className="tabular-nums">
            Build {formatJakartaStamp(builtAt)} · skema v{SCHEMA_VERSION}
          </span>
        </div>
      </div>
    </footer>
  );
}
