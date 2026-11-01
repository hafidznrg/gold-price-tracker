import type { Metadata } from 'next';
import { DataAge } from '@/components/data-age';
import { PageIntro } from '@/components/page-intro';
import { buttonVariants } from '@/components/ui/button';
import { dataUrl } from '@/lib/data/paths';
import type { ColorToken, DownloadEntry } from '@/lib/data';
import { readMeta } from '@/lib/data/load-fs';
import {
  formatDate,
  formatNumber,
  formatRupiah,
  formatTimeWib,
  formatWeight,
} from '@/lib/format';
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
  xau_usd_oz:
    'Harian 5 tahun (futures GC=F via xaus) + rata-rata bulanan World Bank sejak 1996',
  usd_idr_jisdor: 'Kurs acuan Bank Indonesia, hari kerja',
  usd_idr_ecb: 'Dihitung dari EUR/IDR ÷ EUR/USD, 2 desimal',
  usd_idr_annual: 'World Bank WDI, rata-rata tahunan resmi untuk 1996–1998',
};

const DOT: Record<ColorToken, string> = {
  antam: 'bg-antam',
  ubs: 'bg-ubs',
  g24: 'bg-g24',
  tab: 'bg-tab',
  gold: 'bg-gold',
  muted: 'bg-muted',
};

const BRAND_NAME = { antam: 'Antam', ubs: 'UBS', galeri24: 'Galeri24', pegadaian: '' } as const;

/** Baris "kapan": tanggal + jam bila ada; UBS tanpa jam; Pegadaian = jam harga terbit. */
function whenText(d: DownloadEntry): string {
  if (!d.last_date) return '—';
  if (d.last?.kind === 'macro' && d.last.frequency === 'A') return `${d.last.date.slice(0, 4)} · seri statis`;
  if (d.last_updated_at) {
    const verb = d.id.startsWith('pegadaian') ? 'harga terbit ' : '';
    return `${formatDate(d.last_date)} · ${verb}${formatTimeWib(d.last_updated_at)}`;
  }
  return `${formatDate(d.last_date)} · sumber tanpa jam`;
}

function valueText(d: DownloadEntry): string {
  const l = d.last;
  if (!l) return 'Belum ada data';
  if (l.kind === 'macro') {
    return l.unit === 'USD/ozt'
      ? `US$${formatNumber(l.value, 2)} per troy ounce`
      : `Rp${formatNumber(l.value, Number.isInteger(l.value) ? 0 : 2)} per US$`;
  }
  const prices = `jual ${formatRupiah(l.sell)} · buyback ${l.buyback === null ? 'tidak ditampilkan' : formatRupiah(l.buyback)}`;
  const brand = BRAND_NAME[l.brand];
  const prefix =
    l.product === 'gold_savings'
      ? `Per ${formatWeight(l.w)}`
      : `${brand ? `${brand} ` : ''}${formatWeight(l.w)}${l.variant ? ` produksi ${l.variant}` : ''}`;
  return `${prefix}: ${prices}`;
}

function rangeText(d: DownloadEntry): string {
  return d.first_date ? `Sejak ${formatDate(d.first_date)}` : '';
}

function DownloadCard({ d, builtAt }: { d: DownloadEntry; builtAt: string }) {
  const multi = d.files.length > 1;
  return (
    <article className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-5">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-[5px] size-2.5 flex-none rounded-[3px]', DOT[d.color])} />
        <div>
          <h3 className="m-0 text-[15.5px] font-semibold">{d.label}</h3>
          {DESC[d.id] ? (
            <div className="mt-1 text-[12.5px] leading-[1.45] text-muted">{DESC[d.id]}</div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-[14px] bg-surface2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow text-faint">Data terakhir</span>
          <DataAge
            at={d.last_updated_at}
            date={d.last_date}
            isStatic={d.static}
            builtAt={builtAt}
          />
        </div>
        <div className="num text-base font-semibold">{whenText(d)}</div>
        <div className="num text-[12.5px] leading-normal text-muted">{valueText(d)}</div>
      </div>
      <div className="mt-auto flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="num text-[12.5px] text-faint">{rangeText(d)}</span>
          {multi ? null : <DownloadButtons json={d.files[0]?.json} csv={d.files[0]?.csv} label={d.label} />}
        </div>
        {multi
          ? d.files.map((f) => (
              <div key={f.csv} className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[12.5px] text-muted">{f.label}</span>
                <DownloadButtons json={f.json} csv={f.csv} label={`${d.label} ${f.label}`} />
              </div>
            ))
          : null}
      </div>
    </article>
  );
}

function DownloadButtons({ json, csv, label }: { json?: string; csv?: string; label: string }) {
  if (!json || !csv) return null;
  return (
    <div className="flex gap-1.5">
      <a
        href={dataUrl(csv)}
        download
        aria-label={`Unduh CSV ${label}`}
        className={buttonVariants({ size: 'sm' })}
      >
        CSV
      </a>
      <a
        href={dataUrl(json)}
        download
        aria-label={`Unduh JSON ${label}`}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        JSON
      </a>
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <h2 className="serif m-0 text-[32px]">{title}</h2>
      <span className="text-[12.5px] text-muted">{note}</span>
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
          <span className="rounded-full border border-line px-[13px] py-[9px] text-[12.5px] text-muted">
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
          <div className="rounded-[20px] border border-dashed border-line bg-surface p-5 text-[13.5px] leading-[1.6] text-muted">
            Seri pembanding dunia (emas XAU/USD dan kurs USD/IDR) belum dikumpulkan, jadi belum ada
            berkas yang dapat diunduh. Kartu akan muncul di sini begitu datanya tersedia.
          </div>
        )}
      </section>
    </>
  );
}
