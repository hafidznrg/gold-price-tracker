'use client';

import type { PriceSource } from '@gold/schema';
import { useMemo, useState } from 'react';
import { BarChart, type BarItem } from '@/components/charts/bar-chart';
import { SpreadBandChart } from '@/components/charts/spread-band-chart';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { RangeControl, type RangeValue } from '@/components/range-control';
import { InfoDisclosure } from '@/components/info-disclosure';
import { SourceStamp } from '@/components/source-stamp';
import { useSeriesFiles } from '@/components/use-series-files';
import type { ColorToken } from '@/lib/data';
import { EMPTY, formatDate, formatNumber, formatPct, formatRupiah } from '@/lib/format';
import { rangeToDates } from '@/lib/range';
import {
  findGaps,
  pairDays,
  pairProblem,
  sliceDays,
  spreadStats,
  type CompareItem,
  type SpreadDay,
  type SpreadOption,
  type TodayPair,
  type WeightBarRow,
  POPULAR_PAIRS,
} from '@/lib/spread';
import { cn } from '@/lib/utils';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import { useChartHeight } from '@/components/use-chart-height';

export interface BarSource {
  id: string;
  label: string;
  note: string;
  source: PriceSource;
  date: string | null;
  at: string | null;
  rows: WeightBarRow[];
}

export interface SpreadBoardProps {
  sellOptions: SpreadOption[];
  buybackOptions: SpreadOption[];
  /** Harga hari ini per pasangan sah, kunci `${sellId}|${buybackId}`. */
  today: Record<string, TodayPair>;
  compare: CompareItem[];
  bars: BarSource[];
  /** Tanggal data terbaru (patokan rentang). */
  asOf: string;
  /** Kalender terbit sumber, agar akhir pekan/libur tidak dianggap celah. */
  calendar: DataCalendar;
}

const FIELD = 'h-10 w-full rounded-field border border-line bg-surface2 px-3 text-sm text-text';
const PANEL = 'min-w-0 rounded-card border border-line bg-surface p-6 max-sm:p-4';
const BG: Record<ColorToken, string> = {
  antam: 'bg-antam',
  ubs: 'bg-ubs',
  g24: 'bg-g24',
  tab: 'bg-tab',
  gold: 'bg-gold',
  muted: 'bg-muted',
};

function Kpi({
  label,
  value,
  sub,
  gold,
}: {
  label: string;
  value: string;
  sub: string;
  gold?: boolean;
}) {
  return (
    <div className="min-w-0 bg-surface px-3 py-2">
      <div className="truncate text-xs text-faint">{label}</div>
      <div
        className={cn(
          'num text-lg font-semibold leading-tight tracking-[-0.02em]',
          gold ? 'text-gold' : '',
        )}
      >
        {value}
      </div>
      <div className="num truncate text-xs text-muted lg:whitespace-normal">{sub}</div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-10 text-center text-sm text-muted">{children}</p>;
}

export function SpreadBoard({
  sellOptions,
  buybackOptions,
  today,
  compare,
  bars,
  asOf,
  calendar,
}: SpreadBoardProps) {
  const [sellId, setSellId] = useState('lm-antam');
  const [buyId, setBuyId] = useState('lm-antam');
  const [range, setRange] = useState<RangeValue>('1T');
  const [barId, setBarId] = useState(bars[0]?.id ?? '');
  const chartH = useChartHeight(280, 220);

  const sell = sellOptions.find((o) => o.id === sellId) as SpreadOption;
  const buy = buybackOptions.find((o) => o.id === buyId) as SpreadOption;
  const problem = pairProblem(sell, buy);
  const tabOpt = sellOptions.find((o) => o.id === 'tab') as SpreadOption;
  const lmOpt = sellOptions.find((o) => o.id === 'lm-antam') as SpreadOption;

  const needed = useMemo(
    () => [...new Set([lmOpt.file, tabOpt.file, ...(problem ? [] : [sell.file, buy.file])])],
    [lmOpt.file, tabOpt.file, problem, sell.file, buy.file],
  );
  const { files, loading, error } = useSeriesFiles(needed);

  const allDays: SpreadDay[] | null = useMemo(() => {
    const s = files[sell.file];
    const b = files[buy.file];
    return !problem && s && b ? pairDays(sell, s, buy, b) : null;
  }, [files, sell, buy, problem]);

  const lastDate = allDays?.at(-1)?.date ?? asOf;
  const { from, to } = rangeToDates(range, lastDate);
  const days = useMemo(() => (allDays ? sliceDays(allDays, from, to) : []), [allDays, from, to]);
  const stats = useMemo(() => spreadStats(days), [days]);
  const gaps = useMemo(
    () =>
      labelGaps(
        findGaps(
          days.map((d) => d.date),
          2,
          expectedFor(calendar, [sell.source, buy.source]),
        ),
      ),
    [days, calendar, sell.source, buy.source],
  );

  const sellSeries: TimeSeries = useMemo(
    () => ({
      id: 'sell',
      label: 'Harga jual',
      color: sell.color,
      points: days.map((d) => [d.date, d.sell]),
    }),
    [days, sell.color],
  );
  const buySeries: TimeSeries = useMemo(
    () => ({
      id: 'buyback',
      label: 'Buyback',
      color: sell.color,
      dashed: true,
      points: days.map((d) => [d.date, d.buyback]),
    }),
    [days, sell.color],
  );

  // Grafik spread %: Antam Logam Mulia vs Tabungan Emas, pada rentang yang sama.
  const lmDays = useMemo(() => {
    const f = files[lmOpt.file];
    return f ? sliceDays(pairDays(lmOpt, f, lmOpt, f), from, to) : null;
  }, [files, lmOpt, from, to]);
  const tabDays = useMemo(() => {
    const f = files[tabOpt.file];
    return f ? sliceDays(pairDays(tabOpt, f, tabOpt, f), from, to) : null;
  }, [files, tabOpt, from, to]);
  const lmStats = useMemo(() => (lmDays ? spreadStats(lmDays) : null), [lmDays]);
  const pctSeries: TimeSeries[] = useMemo(() => {
    const out: TimeSeries[] = [];
    if (lmDays?.length) {
      out.push({
        id: 'lm',
        label: 'Antam 1 g · Logam Mulia',
        color: 'gold',
        highlightMin: true,
        points: lmDays.map((d) => [d.date, d.pct]),
      });
      if (lmStats) {
        out.push({
          id: 'lm-avg',
          label: 'Rata-rata Antam LM',
          color: 'muted',
          dashed: true,
          width: 1.2,
          points: [
            [lmDays[0]!.date, lmStats.avgPct],
            [lmDays.at(-1)!.date, lmStats.avgPct],
          ],
        });
      }
    }
    if (tabDays?.length) {
      out.push({
        id: 'tab',
        label: 'Tabungan Emas · Pegadaian',
        color: 'tab',
        points: tabDays.map((d) => [d.date, d.pct]),
      });
    }
    return out;
  }, [lmDays, tabDays, lmStats]);

  const bar = bars.find((b) => b.id === barId) ?? bars[0];
  const barItems: BarItem[] = (bar?.rows ?? []).map((r) => ({
    label: r.label,
    value: r.value,
    highlight: r.w === 1,
  }));
  const barMissing = (bar?.rows ?? []).filter((r) => r.value === null).length;

  const pairToday = problem ? null : (today[`${sellId}|${buyId}`] ?? null);
  const stampNote = [
    sell.source === buy.source ? '' : `buyback: ${buy.short}`,
    allDays && allDays.length > 0 && allDays.length < 30
      ? `baru ${allDays.length} hari memiliki jual dan buyback sekaligus`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const cmpMax = Math.max(0, ...compare.map((c) => c.pct ?? 0));
  const pairLabel = `${sell.label} → ${buy.label}`;

  return (
    <>
      <section className="wrap pb-[18px]">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-[1_1_300px] items-center gap-2.5">
              <label
                htmlFor="buyAt"
                className="w-[82px] flex-none text-xs leading-tight text-muted"
              >
                Beli di (harga jual)
              </label>
              <select
                id="buyAt"
                className={FIELD}
                value={sellId}
                onChange={(e) => setSellId(e.target.value)}
              >
                {sellOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div
              aria-hidden="true"
              className="grid h-10 place-items-center text-gold max-md:hidden"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                className="fill-none stroke-current stroke-[1.8]"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12h15M14 6l6 6-6 6" />
              </svg>
            </div>
            <div className="flex min-w-0 flex-[1_1_300px] items-center gap-2.5">
              <label
                htmlFor="sellTo"
                className="w-[82px] flex-none text-xs leading-tight text-muted"
              >
                Jual ke (harga buyback)
              </label>
              <select
                id="sellTo"
                className={FIELD}
                value={buyId}
                onChange={(e) => setBuyId(e.target.value)}
              >
                {buybackOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex min-w-0">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="mr-1 flex-none whitespace-nowrap text-xs text-faint">
                Pasangan populer
              </span>
              {POPULAR_PAIRS.map((p) => {
                const on = p.sell === sellId && p.buyback === buyId;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setSellId(p.sell);
                      setBuyId(p.buyback);
                    }}
                    className={cn(
                      'min-h-9 flex-none cursor-pointer whitespace-nowrap rounded-full border px-3.5 text-xs',
                      on
                        ? 'border-goldline bg-goldsoft text-text'
                        : 'border-line bg-transparent text-muted hover:text-text',
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {problem ? (
        <section className="wrap pb-[22px]">
          <div className={cn(PANEL, 'text-sm leading-relaxed text-muted')} role="status">
            {problem}
          </div>
        </section>
      ) : (
        <>
          <section className="wrap pb-[22px]">
            <div className="min-w-0 rounded-card border border-line bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-[1_1_320px]">
                  <h2 className="m-0 text-xl font-semibold max-sm:text-lg">
                    Harga jual vs buyback
                  </h2>
                  <p className="num m-0 mt-0.5 text-sm text-muted max-sm:truncate">
                    {pairLabel} · per gram
                    {days.length > 0
                      ? ` · ${formatDate(days[0]!.date)} – ${formatDate(days.at(-1)!.date)}`
                      : ''}
                  </p>
                </div>
                <RangeControl
                  size="sm"
                  className="min-w-0 lg:flex-none"
                  value={range}
                  onChange={setRange}
                  lastDate={lastDate}
                  minDate={allDays?.[0]?.date}
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
                <div className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-[14px] border border-line bg-line order-last lg:grid-cols-1">
                  <Kpi
                    gold
                    label="Spread hari ini"
                    value={stats ? formatPct(stats.last.pct, 2, false) : EMPTY}
                    sub={
                      stats
                        ? `${formatRupiah(stats.last.spread)} per gram · ${formatDate(stats.last.date)}`
                        : 'Belum ada hari dengan jual dan buyback'
                    }
                  />
                  <Kpi
                    label={`Rata-rata ${typeof range === 'string' ? range : 'rentang'}`}
                    value={stats ? formatPct(stats.avgPct, 2, false) : EMPTY}
                    sub={stats ? `dari ${formatNumber(stats.count)} hari data` : EMPTY}
                  />
                  <Kpi
                    label={`Tersempit ${typeof range === 'string' ? range : 'rentang'}`}
                    value={stats ? formatPct(stats.min.pct, 2, false) : EMPTY}
                    sub={stats ? formatDate(stats.min.date) : EMPTY}
                  />
                  <Kpi
                    label="Titik impas"
                    value={stats?.breakEven != null ? formatPct(stats.breakEven, 2) : EMPTY}
                    sub="kenaikan buyback yang dibutuhkan"
                  />
                </div>
                <div className="min-w-0">
                  {error ? (
                    <Hint>Data gagal dimuat. Muat ulang halaman.</Hint>
                  ) : loading || !allDays ? (
                    <Hint>Memuat data…</Hint>
                  ) : days.length === 0 ? (
                    <Hint>
                      Belum ada hari dengan harga jual dan buyback sekaligus untuk pasangan dan
                      rentang ini.
                    </Hint>
                  ) : (
                    <SpreadBandChart
                      sell={sellSeries}
                      buyback={buySeries}
                      gaps={gaps}
                      ariaLabel={`Harga jual dan buyback ${pairLabel}`}
                      height={chartH}
                    />
                  )}
                </div>
              </div>
              <SourceStamp source={sell.source} date={stats?.last.date ?? asOf} className="mt-3">
                {stampNote || null}
              </SourceStamp>
            </div>
          </section>
        </>
      )}

      <section className="wrap grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5 pb-[22px]">
        <div className={PANEL}>
          <h2 className="m-0 text-xl font-semibold max-sm:text-lg">Spread % dari waktu ke waktu</h2>
          <p className="m-0 mt-1.5 mb-3 text-sm text-muted">
            Garis putus-putus = rata-rata Antam LM · titik = spread tersempit
            {tabDays && tabDays.length > 0 && tabDays[0]!.date > (from ?? '')
              ? ' · Tabungan Emas hanya tersedia 360 hari terakhir'
              : ''}
          </p>
          {error ? (
            <Hint>Data gagal dimuat.</Hint>
          ) : !lmDays || !tabDays ? (
            <Hint>Memuat data…</Hint>
          ) : pctSeries.length === 0 ? (
            <Hint>Tidak ada data pada rentang ini.</Hint>
          ) : (
            <TimeSeriesChart
              series={pctSeries}
              valueFormat="percent"
              height={250}
              ariaLabel="Spread persen Antam Logam Mulia dan Tabungan Emas"
            />
          )}
          <InfoDisclosure className="mt-3">
            <SourceStamp source="logammulia" date={lmStats?.last.date ?? asOf} bare>
              Antam 1 g
            </SourceStamp>
            <SourceStamp source="pegadaian" date={tabDays?.at(-1)?.date ?? asOf} bare>
              Tabungan Emas, per gram
            </SourceStamp>
          </InfoDisclosure>
        </div>

        <div className={PANEL}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-xl font-semibold max-sm:text-lg">
                Spread % per gramasi hari ini
              </h2>
              <p className="m-0 mt-1.5 mb-4 text-sm text-muted">{bar?.note}</p>
            </div>
            <div className="w-[190px] max-w-full">
              <label htmlFor="barSrc" className="sr-only">
                Sumber
              </label>
              <select
                id="barSrc"
                className={FIELD}
                value={bar?.id}
                onChange={(e) => setBarId(e.target.value)}
              >
                {bars.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {barItems.length > 0 ? (
            <BarChart items={barItems} ariaLabel="Spread persen per gramasi" decimals={1} />
          ) : (
            <Hint>Belum ada data.</Hint>
          )}
          {barMissing > 0 ? (
            <p className="m-0 mt-3 text-xs text-faint">
              {EMPTY} = sumber tidak menampilkan buyback untuk gramasi ini ({barMissing} gramasi).
            </p>
          ) : null}
          {bar ? (
            <SourceStamp source={bar.source} date={bar.date ?? asOf} at={bar.at} className="mt-3" />
          ) : null}
        </div>
      </section>

      <section className="wrap grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-5 pb-16">
        <div className={cn(PANEL, 'flex flex-col gap-[18px]')}>
          <div>
            <h2 className="m-0 text-xl font-semibold max-sm:text-lg">
              Emas fisik vs tabungan emas
            </h2>
            <p className="m-0 mt-2 text-sm leading-[1.6] text-muted">
              Spread per gram hari ini. Tabungan emas tidak menanggung ongkos cetak per keping,
              sehingga jarak jual–buyback-nya biasanya lebih sempit.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {compare.map((c) => (
              <div key={`${c.name}${c.src}`} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap justify-between gap-x-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn('size-[9px] flex-none rounded-[2px]', BG[c.color])} />
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-muted">· {c.src}</span>
                  </span>
                  <span className="num font-semibold">{formatPct(c.pct, 2, false)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-[5px] bg-surface2">
                  <div
                    className={cn('h-full rounded-[5px]', BG[c.color])}
                    style={{
                      width: `${c.pct !== null && cmpMax > 0 ? ((c.pct / cmpMax) * 100).toFixed(1) : 0}%`,
                    }}
                  />
                </div>
                <span className="num text-xs text-faint">
                  {c.sell !== null && c.buyback !== null
                    ? `jual ${formatRupiah(c.sell)} · buyback ${formatRupiah(c.buyback)}`
                    : 'Data belum lengkap'}
                </span>
              </div>
            ))}
          </div>
          {compare[0]?.date ? (
            <SourceStamp source={compare[0].source} date={compare[0].date} at={compare[0].at}>
              Logam Mulia, UBS Lifestyle
            </SourceStamp>
          ) : null}
        </div>

        <div className={cn(PANEL, 'flex flex-col gap-[18px]')}>
          <div>
            <h2 className="m-0 text-xl font-semibold max-sm:text-lg">Pasangan lintas sumber</h2>
            <p className="m-0 mt-2 text-sm leading-[1.6] text-muted">
              {problem
                ? problem
                : `${pairLabel}. Dicocokkan pada brand, produk, dan gramasi yang sama di tanggal yang sama; buyback UBS memakai tahun produksi berjalan.`}
            </p>
          </div>
          {pairToday && pairToday.sell !== null && pairToday.buyback !== null ? (
            <>
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-line bg-line max-sm:grid-cols-1">
                <div className="min-w-0 bg-surface p-3.5">
                  <div className="text-xs text-faint">Jual · {sell.short}</div>
                  <div className="num mt-1 text-lg font-semibold">
                    {formatRupiah(pairToday.sell)}
                  </div>
                </div>
                <div className="min-w-0 bg-surface p-3.5">
                  <div className="text-xs text-faint">Buyback · {buy.short}</div>
                  <div className="num mt-1 text-lg font-semibold">
                    {formatRupiah(pairToday.buyback)}
                  </div>
                </div>
                <div className="min-w-0 bg-surface p-3.5">
                  <div className="text-xs text-faint">Spread</div>
                  <div className="num mt-1 text-lg font-semibold text-gold">
                    {formatPct(
                      ((pairToday.sell - pairToday.buyback) / pairToday.sell) * 100,
                      2,
                      false,
                    )}
                  </div>
                  <div className="num mt-0.5 text-xs text-muted">
                    {formatRupiah(pairToday.sell - pairToday.buyback)}
                  </div>
                </div>
              </div>
              <InfoDisclosure>
                <SourceStamp
                  source={sell.source}
                  date={pairToday.sellDate ?? asOf}
                  at={pairToday.sellAt}
                  bare
                >
                  harga jual
                </SourceStamp>
                {sell.source !== buy.source ? (
                  <SourceStamp
                    source={buy.source}
                    date={pairToday.buyDate ?? asOf}
                    at={pairToday.buyAt}
                    bare
                  >
                    buyback
                  </SourceStamp>
                ) : null}
              </InfoDisclosure>
            </>
          ) : problem ? null : (
            <p className="m-0 text-sm text-muted">
              Data hari ini belum lengkap untuk pasangan ini (jual atau buyback kosong).
            </p>
          )}
        </div>
      </section>
    </>
  );
}
