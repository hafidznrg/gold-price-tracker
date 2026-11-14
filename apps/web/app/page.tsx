import type { Metadata } from 'next';
import { Freshness, type FreshnessItem } from '@/components/freshness';
import { HomeEducation } from '@/components/home-education';
import { PriceCard } from '@/components/price-card';
import { SITE_NAME, SITE_TAGLINE } from '@/components/site-header';
import { HomeMatrix } from '@/components/home-matrix';
import { HomeTrend } from '@/components/home-trend';
import { SOURCE_LABELS, type LatestSpot } from '@/lib/data';
import { readLatest, readMeta } from '@/lib/data/load-fs';
import {
  EMPTY,
  formatDate,
  formatDateLong,
  formatNumber,
  formatPct,
  formatRupiah,
  formatTimeWib,
  jakartaDateOf,
} from '@/lib/format';
import { compareOptions, todayCells } from '@/lib/bandingkan';
import { calendarFromMeta } from '@/lib/calendar';
import { explorerOptions } from '@/lib/explorer';
import { TREND_DEFS } from '@/lib/home-matrix';
import { buildCards } from '@/lib/today';

const NA = 'Belum tersedia';

function SpotItem({
  label,
  value,
  unit,
  gold,
}: {
  label: string;
  value: string | null;
  unit?: string;
  gold?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 sm:block">
      <span>{label}</span>{' '}
      <span>
        {value === null ? (
          <b className="font-semibold text-muted">{NA}</b>
        ) : (
          <>
            <b className={`num font-semibold ${gold ? 'text-gold' : 'text-text'}`}>{value}</b>
            {unit}
          </>
        )}
      </span>
    </span>
  );
}

function SpotStrip({ spot }: { spot: LatestSpot | null }) {
  const s = spot?.snapshot;
  const prem = spot?.premium_antam;
  return (
    // HP: daftar bertumpuk satu baris per angka; tablet 2 per baris; desktop 4 dalam satu baris (D-54).
    <div
      aria-label="Pembanding spot dunia"
      className="grid grid-cols-1 gap-x-7 gap-y-2 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted sm:grid-cols-2 lg:flex lg:flex-wrap"
    >
      <SpotItem
        label="Emas dunia"
        value={s ? `US$${formatNumber(s.xau_usd_oz, 2)}` : null}
        unit="/oz"
      />
      <SpotItem label="Kurs JISDOR" value={s ? `Rp${formatNumber(s.usd_idr, 0)}` : null} />
      <SpotItem
        label="Spot dalam rupiah"
        value={spot ? formatRupiah(spot.idr_gram) : null}
        unit="/g"
      />
      <SpotItem
        label="Premi Antam di atas spot"
        value={prem ? formatPct(prem.pct, 1) : null}
        gold
      />
    </div>
  );
}

function whenOf(source: string, date: string | null, at: string | null): string {
  if (!date) return EMPTY;
  if (source === 'ubslifestyle' || !at) return `data ${formatDate(date, false)}`;
  const verb = source === 'pegadaian' ? 'harga terbit' : '';
  return `${formatDate(date, false)} · ${verb} ${formatTimeWib(at)}`.replace('  ', ' ');
}

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} · ${SITE_TAGLINE}` },
};

export default function HomePage() {
  const latest = readLatest();
  const meta = readMeta();
  const cards = buildCards(latest);
  const cells = todayCells(latest);
  const trendOptions = compareOptions(explorerOptions(meta)).filter((o) =>
    TREND_DEFS.some(
      (d) =>
        d.source === o.source &&
        d.brand === o.brand &&
        d.product === o.product &&
        (d.linear || o.w === 1),
    ),
  );
  const asOf = meta.as_of ?? latest.as_of ?? new Date().toISOString().slice(0, 10);
  const macro = meta.sources.filter(
    (s) => s.kind === 'macro' && (s.id === 'xaus' || s.id === 'jisdor'),
  );

  const freshItems: FreshnessItem[] = [
    ...latest.sources.map((s) => ({
      id: s.source,
      name: SOURCE_LABELS[s.source],
      when: whenOf(s.source, s.last_data_date, s.source_updated_at),
      date: s.last_data_date,
    })),
    ...macro.map((s) => ({
      id: s.id,
      name: s.id === 'xaus' ? 'XAU/USD' : 'JISDOR',
      when: s.last_data_date ? formatDate(s.last_data_date, false) : 'belum ada data',
      date: s.last_data_date,
    })),
  ];
  const stamps = [
    ...latest.sources.map((s) => s.source_updated_at),
    ...macro.map((s) => s.source_updated_at),
  ].filter((x): x is string => !!x);
  const latestAt = stamps.length > 0 ? stamps.reduce((a, b) => (a > b ? a : b)) : null;
  const latestLabel = latestAt
    ? `${formatDate(jakartaDateOf(new Date(latestAt)), false)}, ${formatTimeWib(latestAt)}`
    : EMPTY;

  return (
    <>
      <section className="border-b border-line bg-hero">
        <div className="wrap flex flex-col gap-6 py-9">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <p className="eyebrow m-0 mb-2.5 text-xs tracking-[0.14em] text-gold">
                {latest.as_of ? formatDateLong(latest.as_of) : 'Harga per 1 gram'}
              </p>
              <h1 className="serif m-0 text-[46px] leading-[1.05] max-sm:text-[38px]">
                Harga emas hari ini
              </h1>
              <p className="serif m-0 mt-1.5 text-[22px] leading-[1.3] text-gold italic">
                {SITE_TAGLINE}
              </p>
              <p className="m-0 mt-2.5 max-w-[560px] text-base leading-[1.55] text-muted max-sm:text-sm">
                Harga jual, buyback, dan selisihnya untuk keping 1 gram, dari situs resmi
                masing-masing penerbit. Bukan rekomendasi investasi.
              </p>
            </div>
            <Freshness items={freshItems} latestLabel={latestLabel} builtAt={meta.built_at} />
          </div>

          {/* HP 1 kolom, tablet 2 kolom, desktop lebar 4 kolom. */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <PriceCard key={c.id} c={c} />
            ))}
          </div>

          <SpotStrip spot={latest.spot} />
        </div>
      </section>

      <HomeMatrix cells={cells} />
      <HomeTrend options={trendOptions} asOf={asOf} calendar={calendarFromMeta(meta)} />
      <HomeEducation />
    </>
  );
}
