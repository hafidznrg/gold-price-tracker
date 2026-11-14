import type { Metadata } from 'next';
import { DataAge } from '@/components/data-age';
import { PageIntro } from '@/components/page-intro';
import { DownloadDialog } from '@/components/download-dialog';
import type { ColorToken, DownloadEntry } from '@/lib/data';
import { readMeta } from '@/lib/data/load-fs';
import { formatDate, formatNumber, formatRupiah, formatTimeWib, formatWeight } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Data',
  description:
    'Unduh data harga emas batangan Indonesia dan pembanding dunia (XAU/USD, USD/IDR) dalam format CSV dan JSON, diperbarui setiap hari.',
  openGraph: { title: 'Data' },
};

/** Keterangan kartu (teks mockup); kunci = `DownloadEntry.id`. Tanpa entri → tanpa keterangan. */
const DESC: Record<string, string> = {
  'logammulia-antam':
    '12 gramasi 0,5–1.000 g, butik Jakarta. Harga jual = Harga Dasar (belum termasuk PPh 0,25%); buyback hanya 1 g',
  'ubslifestyle-ubs': '13 pecahan 0,05–100 g, semua tahun produksi',
  'pegadaian-fisik': 'Antam, UBS, dan Galeri24, 0,5–1.000 g; hanya harga jual',
  'pegadaian-pegadaian': 'Harga jual dan buyback, dicatat per 0,01 g',
  xau_usd_oz: 'Harian 5 tahun (futures GC=F via xaus) + rata-rata bulanan World Bank sejak 1996',
  usd_idr_jisdor: 'Kurs acuan Bank Indonesia, hari kerja',
  usd_idr_ecb: 'Dihitung dari EUR/IDR ÷ EUR/USD, 2 desimal',
  usd_idr_annual: 'World Bank WDI, rata-rata tahunan resmi untuk 1996–1998',
};

const DOT: Record<ColorToken, string> = {
  antam: 'bg-antam',
  ubs: 'bg-ubs',
  g24: 'bg-g24',
  tab: 'bg-tab',
  spot: 'bg-spot',
  gold: 'bg-gold',
  muted: 'bg-muted',
};

const BRAND_NAME = { antam: 'Antam', ubs: 'UBS', galeri24: 'Galeri24', pegadaian: '' } as const;

/** Baris "kapan": tanggal + jam bila sumber mencatat jam; Pegadaian = jam harga terbit. */
function whenText(d: DownloadEntry): string {
  if (!d.last_date) return '—';
  if (d.last?.kind === 'macro' && d.last.frequency === 'A')
    return `Tahun ${d.last.date.slice(0, 4)} · seri statis`;
  if (d.last_updated_at) {
    const verb = d.id.startsWith('pegadaian') ? 'terbit ' : '';
    return `${formatDate(d.last_date)} · ${verb}${formatTimeWib(d.last_updated_at)}`;
  }
  return formatDate(d.last_date);
}

/** Nilai terakhir: angka utama + keterangan (apa yang diukur, buyback bila ada). */
function valueParts(d: DownloadEntry): { main: string; caption: string } | null {
  const l = d.last;
  if (!l) return null;
  if (l.kind === 'macro') {
    return l.unit === 'USD/ozt'
      ? { main: `US$${formatNumber(l.value, 2)}`, caption: 'per troy ounce' }
      : {
          main: `Rp${formatNumber(l.value, Number.isInteger(l.value) ? 0 : 2)}`,
          caption: 'per US$',
        };
  }
  const brand = BRAND_NAME[l.brand];
  const what =
    l.product === 'gold_savings'
      ? `per ${formatWeight(l.w)}`
      : `${brand ? `${brand} ` : ''}${formatWeight(l.w)}${l.variant ? ` produksi ${l.variant}` : ''}`;
  const buyback = l.buyback === null ? '' : ` · buyback ${formatRupiah(l.buyback)}`;
  return { main: formatRupiah(l.sell), caption: `Harga jual ${what}${buyback}` };
}

function rangeText(d: DownloadEntry): string {
  if (!d.first_date) return '';
  if (d.static || !d.last_date) return `Sejak ${formatDate(d.first_date)}`;
  return `${formatDate(d.first_date)} – ${formatDate(d.last_date)}`;
}

function DownloadCard({ d, builtAt }: { d: DownloadEntry; builtAt: string }) {
  const value = valueParts(d);
  const range = rangeText(d);
  return (
    <article className="flex flex-col gap-4 rounded-card-sm border border-line bg-surface p-5">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-[6px] size-2.5 flex-none rounded-[3px]', DOT[d.color])} />
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-semibold leading-snug">{d.label}</h3>
          {DESC[d.id] ? (
            <p className="m-0 mt-1 text-xs leading-[1.5] text-muted">{DESC[d.id]}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-control bg-surface2 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="whitespace-nowrap text-xs font-medium text-muted">Data terakhir</span>
          <DataAge
            at={d.last_updated_at}
            date={d.last_date}
            isStatic={d.static}
            builtAt={builtAt}
            className="whitespace-nowrap"
          />
        </div>
        {value ? (
          <>
            <div className="num mt-1 text-xl font-semibold leading-tight">{value.main}</div>
            <div className="num text-xs leading-normal text-muted">{value.caption}</div>
          </>
        ) : (
          <div className="mt-1 text-sm text-muted">Belum ada data</div>
        )}
        <div className="num mt-1.5 text-xs text-faint">{whenText(d)}</div>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
        <div className="num flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>{range}</span>
          <span className="text-faint">{formatNumber(d.rows)} baris</span>
        </div>
        <DownloadDialog
          title={d.label}
          range={range}
          files={d.files.map((f) => ({ label: f.label, csv: f.csv, json: f.json, rows: f.rows }))}
        />
      </div>
    </article>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h2 className="serif m-0 text-[32px] max-sm:text-[26px]">{title}</h2>
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}

const GRID = 'grid grid-cols-[repeat(auto-fit,minmax(min(270px,100%),1fr))] gap-3.5';

export default function DataPage() {
  const meta = readMeta();
  const retail = meta.downloads.filter((d) => d.group === 'retail');
  const macro = meta.downloads.filter((d) => d.group === 'macro');

  return (
    <>
      <PageIntro
        eyebrow="Data terbuka"
        title={
          <>
            Unduh <em>setiap seri</em>
          </>
        }
        lead="Data mentah yang sama dengan yang dipakai grafik di situs ini, diperbarui otomatis setiap hari. Bebas dipakai untuk analisis pribadi."
        aside={
          <span className="rounded-full border border-line px-[13px] py-[9px] text-xs text-muted">
            CSV UTF-8 · koma · tanggal Asia/Jakarta
          </span>
        }
      />

      <section className="wrap pb-[30px]">
        <SectionHead title="Harga ritel" note="Emas batangan dan tabungan emas" />
        <div className={GRID}>
          {retail.map((d) => (
            <DownloadCard key={d.id} d={d} builtAt={meta.built_at} />
          ))}
        </div>
      </section>

      <section className="wrap pb-16">
        <SectionHead title="Pembanding dunia" note="Harga emas dunia dan kurs USD/IDR" />
        {macro.length > 0 ? (
          <div className={GRID}>
            {macro.map((d) => (
              <DownloadCard key={d.id} d={d} builtAt={meta.built_at} />
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-line bg-surface p-5 text-sm leading-[1.6] text-muted">
            Seri pembanding dunia (emas XAU/USD dan kurs USD/IDR) belum dikumpulkan, jadi belum ada
            berkas yang dapat diunduh. Kartu akan muncul di sini begitu datanya tersedia.
          </div>
        )}
      </section>
    </>
  );
}
