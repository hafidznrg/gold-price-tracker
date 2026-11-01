import type { ReactNode } from 'react';
import { DataAge } from '@/components/data-age';
import { TodayBoard } from '@/components/today-board';
import { SOURCE_LABELS, type LatestSpot, type MetaSource } from '@/lib/data';
import { readLatest, readMeta } from '@/lib/data/load-fs';
import {
  EMPTY,
  formatDate,
  formatDateLong,
  formatNumber,
  formatPct,
  formatRupiah,
  formatTimeWib,
} from '@/lib/format';
import { buildCards, buildGroups } from '@/lib/today';

const NA = 'Belum tersedia';

function SpotCell({
  label,
  value,
  unit,
  sub,
  gold,
}: {
  label: string;
  value: string | null;
  unit?: string;
  sub: string;
  gold?: boolean;
}) {
  return (
    <div className="bg-surface px-5 py-[18px]">
      <div className="text-xs text-faint">{label}</div>
      {value === null ? (
        <div className="mt-1.5 text-[19px] leading-[1.35] font-semibold text-muted">{NA}</div>
      ) : (
        <div
          className={`num mt-1.5 text-[25px] font-semibold tracking-[-0.01em] ${gold ? 'text-gold' : ''}`}
        >
          {value}
          {unit ? <span className="text-sm font-medium text-muted"> {unit}</span> : null}
        </div>
      )}
      <div className="mt-[5px] text-xs text-muted">{sub}</div>
    </div>
  );
}

function SpotGrid({ spot }: { spot: LatestSpot | null }) {
  const s = spot?.snapshot;
  const prem = spot?.premium_antam;
  return (
    <div
      aria-label="Pembanding spot dunia"
      className="grid min-w-0 flex-[1_1_460px] grid-cols-2 gap-px overflow-hidden rounded-card-sm border border-line bg-line max-sm:flex-[1_1_100%]"
    >
      <SpotCell
        label="XAU/USD spot"
        value={s ? `US$${formatNumber(s.xau_usd_oz, 2)}` : null}
        sub={s ? `indikatif · ${formatTimeWib(s.fetched_at)}` : 'gold-api.com via xaus · indikatif'}
      />
      <SpotCell
        label="USD/IDR JISDOR"
        value={s ? `Rp${formatNumber(s.usd_idr, 0)}` : null}
        sub={s ? `Bank Indonesia · ${formatDate(s.usd_idr_date)}` : 'Bank Indonesia'}
      />
      <SpotCell
        label="Spot dalam rupiah"
        value={spot ? formatRupiah(spot.idr_gram) : null}
        unit="/gram"
        sub="XAU/USD × kurs ÷ 31,1035"
      />
      <SpotCell
        label="Premi Antam vs spot"
        value={prem ? formatPct(prem.pct, 1) : null}
        gold
        sub={prem ? `vs penutupan spot ${formatDate(prem.spot_date, false)}` : 'vs penutupan spot'}
      />
    </div>
  );
}

function Chip({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-[13px] py-2 text-[12.5px]">
      <span className="font-semibold">{name}</span>
      {children}
    </span>
  );
}

function whenOf(source: string, date: string | null, at: string | null): string {
  if (!date) return EMPTY;
  if (source === 'ubslifestyle' || !at) return `data ${formatDate(date, false)} (sumber tanpa jam)`;
  const verb = source === 'pegadaian' ? 'harga terbit' : '';
  return `${formatDate(date, false)} · ${verb} ${formatTimeWib(at)}`.replace('  ', ' ');
}

export default function HomePage() {
  const latest = readLatest();
  const meta = readMeta();
  const cards = buildCards(latest);
  const groups = buildGroups(latest, meta.catalog);
  const prices = latest.sources;
  const macro = meta.sources.filter(
    (s: MetaSource) => s.kind === 'macro' && (s.id === 'xaus' || s.id === 'jisdor'),
  );

  return (
    <>
      <section className="wrap flex flex-wrap items-end justify-between gap-9 pt-[60px] pb-[30px] max-sm:pt-10">
        <div className="min-w-0 flex-[1_1_520px]">
          <p className="eyebrow m-0 mb-4 text-gold">
            {latest.as_of ? `${formatDateLong(latest.as_of)} · ` : ''}harga per 1 gram
          </p>
          <h1 className="serif m-0 text-[72px] leading-none max-sm:text-[44px]">
            Harga emas <em className="text-gold">hari ini</em>
          </h1>
          <p className="m-0 mt-[22px] max-w-[540px] text-base leading-[1.65] text-muted">
            Harga jual dan buyback emas batangan Antam, UBS, dan Galeri24, ditambah Tabungan Emas
            Pegadaian. Dikumpulkan otomatis setiap pagi, divalidasi, lalu disimpan sebagai data
            terbuka.
          </p>
        </div>
        <SpotGrid spot={latest.spot} />
      </section>

      <section className="wrap pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1.5 text-[12.5px] text-faint">Pembaruan terakhir</span>
          {prices.map((s) => (
            <Chip key={s.source} name={SOURCE_LABELS[s.source]}>
              <span className="text-muted">
                {whenOf(s.source, s.last_data_date, s.source_updated_at)}
              </span>
              <DataAge at={s.source_updated_at} date={s.last_data_date} builtAt={meta.built_at} />
            </Chip>
          ))}
          {macro.map((s) => (
            <Chip key={s.id} name={s.id === 'xaus' ? 'XAU/USD' : 'JISDOR'}>
              {s.last_data_date ? (
                <>
                  <span className="text-muted">{formatDate(s.last_data_date, false)}</span>
                  <DataAge
                    at={s.source_updated_at}
                    date={s.last_data_date}
                    builtAt={meta.built_at}
                  />
                </>
              ) : (
                <span className="text-muted">belum ada data</span>
              )}
            </Chip>
          ))}
        </div>
      </section>

      <TodayBoard cards={cards} groups={groups} builtAt={meta.built_at} />
    </>
  );
}
