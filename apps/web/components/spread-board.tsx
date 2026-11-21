'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { BarChart, type BarItem } from '@/components/charts/bar-chart';
import { SpreadBandChart } from '@/components/charts/spread-band-chart';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { RangeControl, type RangeValue } from '@/components/range-control';
import { InfoPopover } from '@/components/info-popover';
import { SourceStamp } from '@/components/source-stamp';
import { useSeriesFiles } from '@/components/use-series-files';
import type { ColorToken } from '@/lib/data';
import { EMPTY, formatDate, formatNumber, formatPct, formatRupiah } from '@/lib/format';
import { DEFAULT_RANGE, decodeRange, encodeRange } from '@/lib/explorer';
import { rangeToDates, rangeWords } from '@/lib/range';
import {
  findGaps,
  pairDays,
  pairProblem,
  sliceDays,
  spreadStats,
  type BarSourceDef,
  type CompareItem,
  type SpreadDay,
  type SpreadOption,
  POPULAR_PAIRS,
  barIdForBuyback,
  buybackChoices,
  resolveBuyback,
  spreadSignal,
  weightBarItems,
} from '@/lib/spread';
import { cn } from '@/lib/utils';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import { useChartHeight } from '@/components/use-chart-height';
import type { ChartRange } from '@/components/charts/time-series-option';

export type BarSource = BarSourceDef;

export interface SpreadBoardProps {
  sellOptions: SpreadOption[];
  buybackOptions: SpreadOption[];
  compare: CompareItem[];
  bars: BarSource[];
  /** Tanggal data terbaru (patokan rentang). */
  asOf: string;
  /** Kalender terbit sumber, agar akhir pekan/libur tidak dianggap celah. */
  calendar: DataCalendar;
}

const DEFAULT_ID = 'lm-antam';
const FIELD =
  'h-10 w-full rounded-field border border-line bg-surface2 px-3 text-sm text-text disabled:cursor-not-allowed disabled:text-muted';
const FIELD_LABEL = 'flex items-baseline gap-1.5 text-sm leading-tight';
const PANEL = 'min-w-0 rounded-card border border-line bg-surface p-6 max-sm:p-4';
const BG: Record<ColorToken, string> = {
  antam: 'bg-antam',
  ubs: 'bg-ubs',
  g24: 'bg-g24',
  lotus: 'bg-lotus',
  emasku: 'bg-emasku',
  tab: 'bg-tab',
  spot: 'bg-spot',
  gold: 'bg-gold',
  muted: 'bg-muted',
};

/** Penanda KPI = legenda grafik spread: garis putus-putus (rata-rata), titik emas (tersempit), titik merah (hari ini). */
function KpiMarker({ kind }: { kind: 'dash' | 'min' | 'today' }) {
  return kind === 'dash' ? (
    <span
      aria-hidden="true"
      className="inline-block h-0 w-3.5 flex-none border-t-2 border-dashed border-gold"
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-2 flex-none rounded-full',
        kind === 'min' ? 'bg-gold' : 'bg-down',
      )}
    />
  );
}

function Kpi({
  label,
  value,
  sub,
  sub2,
  tone,
  marker,
  className,
}: {
  label: string;
  value: string;
  sub: string;
  sub2?: string;
  tone?: 'gold' | 'down';
  marker?: 'dash' | 'min' | 'today';
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 bg-surface px-3 py-2', className)}>
      <div className="flex items-center gap-1.5 text-xs text-faint">
        {marker ? <KpiMarker kind={marker} /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'num text-lg font-semibold leading-tight tracking-[-0.02em]',
          tone === 'gold' ? 'text-gold' : tone === 'down' ? 'text-down' : '',
        )}
      >
        {value}
      </div>
      <div className="num truncate text-xs text-muted lg:whitespace-normal">{sub}</div>
      {sub2 ? (
        <div className="num truncate text-xs text-muted lg:whitespace-normal">{sub2}</div>
      ) : null}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-10 text-center text-sm text-muted">{children}</p>;
}

export function SpreadBoard({
  sellOptions,
  buybackOptions,
  compare,
  bars,
  asOf,
  calendar,
}: SpreadBoardProps) {
  const [query, setQuery] = useQueryStates(
    { beli: parseAsString, jual: parseAsString, r: parseAsString },
    { history: 'replace' },
  );
  // Id tak dikenal jatuh ke bawaan; bawaan tidak ditulis ke URL.
  const sellId = sellOptions.some((o) => o.id === query.beli) ? (query.beli as string) : DEFAULT_ID;
  const buyId = query.jual ?? DEFAULT_ID;
  const range = useMemo(() => decodeRange(query.r), [query.r]);
  const setRange = (r: RangeValue) => {
    const code = encodeRange(r);
    void setQuery({ r: code === encodeRange(DEFAULT_RANGE) ? null : code });
  };
  const setPair = (sid: string, bid: string) =>
    void setQuery({
      beli: sid === DEFAULT_ID ? null : sid,
      jual: bid === DEFAULT_ID ? null : bid,
    });
  // Tinggi sudah termasuk navigator zoom bersama (pola Explorer "Jual + spread").
  const chartH = useChartHeight(250, 200);
  const spreadH = useChartHeight(210, 170);
  const [compareTab, setCompareTab] = useState(true);
  const [showAllPairs, setShowAllPairs] = useState(false);

  const sell = sellOptions.find((o) => o.id === sellId) as SpreadOption;
  // "Jual ke" hanya berisi pasangan sah; pilihan lama yang tidak sah pindah ke pasangan sah pertama.
  const buyChoices = buybackChoices(sell, buybackOptions);
  const pairBuy = resolveBuyback(sell, buybackOptions, buyId);
  const problem = pairProblem(sell, pairBuy);
  // Tanpa pasangan: `buy` hanya pengisi; semua turunan dijaga `problem`.
  const buy = pairBuy ?? sell;
  // Sumber grafik gramasi mengikuti buyback pasangan; pengguna tetap bisa memilih sumber lain.
  const pairBarId = pairBuy ? barIdForBuyback(pairBuy.id) : null;
  const [barId, setBarId] = useState(
    () => bars.find((b) => b.id === pairBarId)?.id ?? bars[0]?.id ?? '',
  );
  useEffect(() => {
    if (pairBarId && bars.some((b) => b.id === pairBarId)) setBarId(pairBarId);
  }, [pairBarId, bars]);
  const tabOpt = sellOptions.find((o) => o.id === 'tab') as SpreadOption;
  // Pembanding Tabungan Emas disembunyikan bila pasangan terpilih adalah Tabungan Emas sendiri.
  const canCompareTab = !problem && sell.id !== 'tab';
  const showTab = canCompareTab && compareTab;

  const needed = useMemo(
    () => [
      ...new Set([...(showTab ? [tabOpt.file] : []), ...(problem ? [] : [sell.file, buy.file])]),
    ],
    [showTab, tabOpt.file, problem, sell.file, buy.file],
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

  // Pembanding: spread Tabungan Emas pada rentang yang sama (hanya bila ditampilkan).
  const tabDays = useMemo(() => {
    const f = showTab ? files[tabOpt.file] : undefined;
    return f ? sliceDays(pairDays(tabOpt, f, tabOpt, f), from, to) : null;
  }, [showTab, files, tabOpt, from, to]);
  const pctSeries: TimeSeries[] = useMemo(() => {
    const out: TimeSeries[] = [];
    if (days.length > 0 && stats) {
      out.push({
        id: 'pct',
        label: sell.label,
        color: sell.color,
        highlightMin: true,
        endLabel: formatPct(days.at(-1)!.pct, 2, false),
        points: days.map((d) => [d.date, d.pct]),
      });
      out.push({
        id: 'pct-avg',
        label: 'Rata-rata rentang',
        color: 'gold',
        dashed: true,
        width: 1.2,
        legend: false,
        points: [
          [days[0]!.date, stats.avgPct],
          [days.at(-1)!.date, stats.avgPct],
        ],
      });
    }
    if (tabDays?.length) {
      out.push({
        id: 'pct-tab',
        label: 'Tabungan Emas',
        color: 'tab',
        width: 1.2,
        points: tabDays.map((d) => [d.date, d.pct]),
      });
    }
    return out;
  }, [days, stats, sell.label, sell.color, tabDays]);

  const chartRange = useMemo(() => (from ? { from, to } : undefined), [from, to]);
  const onChartRange = (r: ChartRange) => {
    if (r.from === from && r.to === to) return;
    setRange({ from: r.from, to: r.to });
  };

  const bar = bars.find((b) => b.id === barId) ?? bars[0];
  const barItems: BarItem[] = weightBarItems(bar?.rows ?? []);
  const barColor: ColorToken = bar?.color ?? 'ubs';
  const barMissing = (bar?.rows ?? []).filter((r) => r.value === null).length;

  const signal = spreadSignal(stats);
  const rangeLabel = rangeWords(range);
  const stampNote = [
    sell.source === buy.source ? '' : `buyback: ${buy.short}`,
    buy.id === 'g24-antam-np'
      ? 'buyback non-Pegadaian: untuk keping Antam yang dibeli di luar Pegadaian atau Galeri24 (lebih rendah dari buyback biasa)'
      : buy.id === 'g24-antam'
        ? 'buyback biasa: untuk keping Antam yang dibeli di Pegadaian atau Galeri24'
        : '',
    'dicocokkan pada brand, produk, dan gramasi yang sama di tanggal yang sama',
    buy.source === 'ubslifestyle' ? 'buyback UBS memakai tahun produksi berjalan' : '',
    allDays && allDays.length > 0 && allDays.length < 30
      ? `baru ${allDays.length} hari memiliki jual dan buyback sekaligus`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const cmpMax = Math.max(0, ...compare.map((c) => c.pct ?? 0));
  const pairLabel = `${sell.label} → ${buy.label}`;
  const pairTitle = `${sell.label} → ${buy.short}`;
  const popular = POPULAR_PAIRS.filter(
    (p) =>
      sellOptions.some((o) => o.id === p.sell) && buybackOptions.some((o) => o.id === p.buyback),
  );
  const POPULAR_VISIBLE = 5;
  const activePopular = popular.findIndex((p) => p.sell === sellId && p.buyback === pairBuy?.id);
  const pairsExpanded = showAllPairs || activePopular >= POPULAR_VISIBLE;
  const shownPopular = pairsExpanded ? popular : popular.slice(0, POPULAR_VISIBLE);

  return (
    <>
      <section className="wrap pb-[18px]">
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 max-sm:p-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end md:gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="buyAt" className={FIELD_LABEL}>
                <span className="font-medium text-text">Beli di</span>
                <span className="text-xs text-faint">harga jual</span>
              </label>
              <select
                id="buyAt"
                className={FIELD}
                value={sellId}
                onChange={(e) =>
                  setPair(
                    e.target.value,
                    resolveBuyback(
                      sellOptions.find((o) => o.id === e.target.value) as SpreadOption,
                      buybackOptions,
                      buyId,
                    )?.id ?? buyId,
                  )
                }
              >
                {sellOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {buybackChoices(o, buybackOptions).length === 0 ? ' · tanpa buyback' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div
              aria-hidden="true"
              className="grid place-items-center text-gold max-md:-mb-1 max-md:h-5 md:h-10"
            >
              <svg
                width="20"
                height="20"
                className="fill-none stroke-current stroke-[1.8] max-md:rotate-90"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12h15M14 6l6 6-6 6" />
              </svg>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="sellTo" className={FIELD_LABEL}>
                <span className="font-medium text-text">Jual ke</span>
                <span className="text-xs text-faint">harga buyback</span>
              </label>
              <select
                id="sellTo"
                className={FIELD}
                value={pairBuy?.id ?? ''}
                disabled={!pairBuy}
                onChange={(e) => setPair(sellId, e.target.value)}
              >
                {pairBuy ? null : <option value="">Belum ada data buyback</option>}
                {buyChoices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2 border-t border-line pt-4">
            <span className="text-xs font-medium uppercase tracking-wider text-faint">
              Pasangan populer
            </span>
            <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {shownPopular.map((p) => {
                const on = p.sell === sellId && p.buyback === pairBuy?.id;
                const cut = p.label.indexOf(': ');
                const brand = cut > 0 ? p.label.slice(0, cut) : '';
                const route = cut > 0 ? p.label.slice(cut + 2) : p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-label={p.label}
                    aria-pressed={on}
                    onClick={() => setPair(p.sell, p.buyback)}
                    className={cn(
                      'inline-flex min-h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-xs transition-colors',
                      on
                        ? 'border-goldline bg-goldsoft text-text'
                        : 'border-line bg-transparent text-muted hover:border-goldline hover:text-text',
                    )}
                  >
                    {brand ? (
                      <span className={cn('font-semibold', on ? 'text-gold' : 'text-text')}>
                        {brand}
                      </span>
                    ) : null}
                    <span>{route}</span>
                  </button>
                );
              })}
              {!pairsExpanded && popular.length > POPULAR_VISIBLE ? (
                <button
                  type="button"
                  onClick={() => setShowAllPairs(true)}
                  className="inline-flex min-h-9 flex-none cursor-pointer items-center whitespace-nowrap rounded-full border border-line bg-transparent px-3.5 text-xs text-muted transition-colors hover:border-goldline hover:text-text"
                >
                  +{popular.length - POPULAR_VISIBLE} lainnya
                </button>
              ) : null}
            </div>
          </div>
          <p className="m-0 max-w-[760px] text-xs leading-relaxed text-muted">
            Galeri24 membeli kembali Antam dengan dua harga:{' '}
            <strong className="font-semibold text-text">biasa</strong> untuk keping yang dibeli di
            Pegadaian atau Galeri24, dan{' '}
            <strong className="font-semibold text-text">non-Pegadaian</strong> (lebih rendah) untuk
            keping dari tempat lain. Pegadaian sendiri tidak memasang harga buyback emas batangan.
          </p>
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
          <section id="pasangan" className="wrap scroll-mt-20 pb-[22px]">
            <div className="min-w-0 rounded-card border border-line bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-[1_1_320px]">
                  <h2 className="m-0 text-xl font-semibold max-sm:text-lg">{pairTitle}</h2>
                  <p className="num m-0 mt-0.5 text-sm text-muted max-sm:truncate">
                    per gram
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
                <div className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-[14px] border border-line bg-line lg:order-last lg:grid-cols-1">
                  <Kpi
                    marker="today"
                    className="order-1"
                    tone={signal?.wide ? 'down' : 'gold'}
                    label="Spread hari ini"
                    value={stats ? formatPct(stats.last.pct, 2, false) : EMPTY}
                    sub={
                      stats
                        ? `${formatRupiah(stats.last.spread)} per gram · ${formatDate(stats.last.date)}`
                        : 'Belum ada hari dengan jual dan buyback'
                    }
                    sub2={
                      signal
                        ? `${formatNumber(signal.ratio, 1)}× rata-rata${signal.wide ? ' · melebar' : ''}`
                        : undefined
                    }
                  />
                  <Kpi
                    marker="dash"
                    className="order-3 lg:order-2"
                    label={`Rata-rata ${rangeLabel}`}
                    value={stats ? formatPct(stats.avgPct, 2, false) : EMPTY}
                    sub={stats ? `dari ${formatNumber(stats.count)} hari data` : EMPTY}
                  />
                  <Kpi
                    marker="min"
                    className="order-4 lg:order-3"
                    label={`Tersempit ${rangeLabel}`}
                    value={stats ? formatPct(stats.min.pct, 2, false) : EMPTY}
                    sub={stats ? formatDate(stats.min.date) : EMPTY}
                  />
                  <Kpi
                    className="order-2 lg:order-4"
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
                    <div className="flex min-w-0 flex-col gap-3">
                      <div className="min-w-0">
                        <p className="m-0 mb-1 text-sm font-semibold">Harga jual vs buyback</p>
                        <SpreadBandChart
                          sell={sellSeries}
                          buyback={buySeries}
                          gaps={gaps}
                          showZoom
                          range={chartRange}
                          onRangeChange={onChartRange}
                          ariaLabel={`Harga jual dan buyback ${pairLabel}`}
                          height={chartH}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="m-0 text-sm font-semibold">
                            Spread (jual − buyback) ÷ jual
                          </p>
                          {canCompareTab ? (
                            <button
                              type="button"
                              aria-pressed={compareTab}
                              onClick={() => setCompareTab((v) => !v)}
                              className={cn(
                                'inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                                compareTab
                                  ? 'border-goldline bg-goldsoft text-text'
                                  : 'border-line bg-transparent text-muted hover:border-goldline hover:text-text',
                              )}
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'grid size-3.5 place-items-center rounded-[3px] border text-[10px] leading-none',
                                  compareTab
                                    ? 'border-text bg-text text-surface'
                                    : 'border-line text-transparent',
                                )}
                              >
                                ✓
                              </span>
                              Pembanding: Tabungan Emas
                            </button>
                          ) : null}
                        </div>
                        <TimeSeriesChart
                          series={pctSeries}
                          gaps={gaps}
                          showZoom
                          legend={false}
                          valueFormat="percent"
                          gridRight={56}
                          range={chartRange}
                          onRangeChange={onChartRange}
                          ariaLabel={`Spread persen ${pairLabel}`}
                          height={spreadH}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <InfoPopover label="Sumber" ariaLabel="Sumber data" side="top" className="mt-3">
                <SourceStamp source={sell.source} date={stats?.last.date ?? asOf} bare>
                  {stampNote || null}
                </SourceStamp>
                {showTab ? (
                  <SourceStamp source="pegadaian" date={tabDays?.at(-1)?.date ?? asOf} bare>
                    Tabungan Emas, per gram (pembanding spread)
                  </SourceStamp>
                ) : null}
              </InfoPopover>
            </div>
          </section>
        </>
      )}

      <section className="wrap pb-[22px]">
        <div className={PANEL}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-[1_1_240px]">
              <h2 className="m-0 text-xl font-semibold max-sm:text-lg">
                Spread % per gramasi hari ini
              </h2>
              <p className="m-0 mt-1.5 text-sm text-muted">{bar?.note}</p>
            </div>
            <div className="w-[190px] max-w-full flex-none max-sm:w-full">
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
            <BarChart
              items={barItems}
              color={barColor}
              ariaLabel="Spread persen per gramasi"
              decimals={1}
            />
          ) : (
            <Hint>Belum ada data.</Hint>
          )}
          {barMissing > 0 ? (
            <p className="m-0 mt-3 text-xs text-faint">
              {EMPTY} = sumber tidak menampilkan buyback untuk gramasi ini ({barMissing} gramasi).
            </p>
          ) : null}
          {barItems.length > 0 ? (
            <p className="m-0 mt-3.5 flex items-center gap-2 text-xs text-faint">
              <span
                aria-hidden="true"
                className={cn('h-2.5 w-[18px] flex-none rounded-[3px]', BG[barColor])}
              />
              {bar && bar.id === pairBarId
                ? '1 g = gramasi acuan yang dipakai grafik di atas. Gramasi lain tampil lebih pudar.'
                : '1 g = gramasi acuan. Gramasi lain tampil lebih pudar.'}
            </p>
          ) : null}
          {bar ? (
            <InfoPopover label="Sumber" ariaLabel="Sumber data" side="top" className="mt-3">
              <SourceStamp source={bar.source} date={bar.date ?? asOf} at={bar.at} bare>
                {bar.note}
              </SourceStamp>
            </InfoPopover>
          ) : null}
        </div>
      </section>

      <section className="wrap pb-16">
        <div className={cn(PANEL, 'flex flex-col gap-[18px]')}>
          <div>
            <h2 className="m-0 text-xl font-semibold max-sm:text-lg">Bolak-balik hari ini</h2>
            <p className="m-0 mt-2 text-sm leading-[1.6] text-muted">
              Spread per gram hari ini untuk tiap pasangan beli → jual kembali, dari yang tersempit.
              Pilih baris untuk melihat riwayatnya di atas. Tabungan emas tidak menanggung ongkos
              cetak per keping, sehingga biasanya lebih sempit.
            </p>
          </div>
          <ul aria-label="Bolak-balik hari ini" className="m-0 flex list-none flex-col gap-1 p-0">
            {compare.map((c, i) => {
              const on = c.sellId === sellId && c.buybackId === pairBuy?.id;
              return (
                <li key={`${c.sellId}|${c.buybackId}`}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setPair(c.sellId, c.buybackId);
                      document
                        .getElementById('pasangan')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={cn(
                      'flex w-full cursor-pointer flex-col gap-1.5 rounded-[10px] border-l-2 px-3 py-2.5 text-left transition-colors',
                      on
                        ? 'border-l-goldline bg-goldsoft'
                        : 'border-l-transparent hover:bg-surface2',
                    )}
                  >
                    <span className="flex flex-wrap justify-between gap-x-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn('size-[9px] flex-none rounded-[2px]', BG[c.color])} />
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-muted">· {c.src}</span>
                        {i === 0 && c.pct !== null ? (
                          <span className="text-xs text-faint">tersempit</span>
                        ) : null}
                      </span>
                      <span className="num font-semibold">{formatPct(c.pct, 2, false)}</span>
                    </span>
                    <span className="h-3 overflow-hidden rounded-[5px] bg-surface2">
                      <span
                        className={cn('block h-full rounded-[5px]', BG[c.color])}
                        style={{
                          width: `${c.pct !== null && cmpMax > 0 ? ((c.pct / cmpMax) * 100).toFixed(1) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="num text-xs text-faint">
                      {c.sell !== null && c.buyback !== null
                        ? `jual ${formatRupiah(c.sell)} · buyback ${formatRupiah(c.buyback)}`
                        : 'Data belum lengkap'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {compare[0]?.date ? (
            <InfoPopover label="Sumber" ariaLabel="Sumber data" side="top" className="self-start">
              <SourceStamp
                source={compare[0].source}
                date={compare[0].date}
                at={compare[0].at}
                bare
              >
                Logam Mulia, UBS Lifestyle, Galeri24, Pegadaian
              </SourceStamp>
            </InfoPopover>
          ) : null}
        </div>
      </section>
    </>
  );
}
