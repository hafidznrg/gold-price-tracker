'use client';

import type { Brand, PriceSource } from '@gold/schema';
import Link from 'next/link';
import { debounce, parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { RangeControl, type RangeValue } from '@/components/range-control';
import { Segmented } from '@/components/segmented';
import { SourceStamp } from '@/components/source-stamp';
import { useSeriesFiles } from '@/components/use-series-files';
import {
  colorVar,
  displayBrand,
  PRODUCT_KIND_LABELS,
  SOURCE_LABELS,
  type PriceField,
  type ProductKind,
  type SeriesPoint,
} from '@/lib/data';
import {
  aggregateClose,
  applyMode,
  chartPoints,
  DEFAULT_PICKS,
  decodeAgg,
  decodeFlag,
  decodeMode,
  DEFAULT_RANGE,
  decodePicks,
  decodeRange,
  effectiveRange,
  encodeAgg,
  encodeFlag,
  encodeMode,
  encodePick,
  encodePicks,
  encodeRange,
  fillGaps,
  fillNotes,
  gramDivisor,
  MAX_SERIES,
  mergeGaps,
  optionColor,
  rangeStats,
  resolvePick,
  samePicks,
  seriesPoints,
  viewChartPoints,
  viewGaps,
  type Aggregation,
  type ExplorerOption,
  type SeriesPick,
  type ValueMode,
  type ViewOptions,
} from '@/lib/explorer';
import {
  changeDirection,
  EMPTY,
  formatDate,
  formatNumber,
  formatPct,
  formatRupiah,
  formatWeight,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import { useChartHeight } from '@/components/use-chart-height';

export interface ExplorerBoardProps {
  options: ExplorerOption[];
  /** Tanggal data terbaru (patokan rentang bila belum ada data termuat). */
  asOf: string;
  /** Stempel per sumber dari meta.json. */
  stamps: Partial<Record<PriceSource, { date: string | null; at: string | null }>>;
  /** Kalender terbit sumber, agar akhir pekan/libur tidak dianggap celah. */
  calendar: DataCalendar;
}

const FIELD = 'h-11 w-full rounded-field border border-line bg-surface2 px-3 text-sm text-text';
const CARD = 'min-w-0 rounded-[18px] border border-line bg-surface p-5';
const PANEL_SM = 'min-w-0 rounded-card border border-line bg-surface p-4';
const PRICE_LABEL: Record<PriceField, string> = { sell: 'Jual', buyback: 'Buyback' };
const DIR_CLASS = { up: 'text-up', down: 'text-down', flat: 'text-muted' } as const;
const GRID = 'grid grid-cols-[minmax(220px,2fr)_repeat(5,minmax(100px,1fr))] px-5';

function seriesLabel(o: ExplorerOption, price: PriceField): string {
  return [
    displayBrand(o),
    SOURCE_LABELS[o.source],
    o.kind === 'fisik' ? formatWeight(o.w) : null,
    PRICE_LABEL[price],
  ]
    .filter(Boolean)
    .join(' · ');
}

const MODE_OPTIONS: { value: ValueMode; label: string }[] = [
  { value: 'nominal', label: 'Nominal' },
  { value: 'gram', label: 'Per gram' },
  { value: 'index', label: 'Indeks' },
  { value: 'pct', label: '% ubah' },
];
const AGG_OPTIONS: { value: Aggregation; label: string }[] = [
  { value: 'd', label: 'Harian' },
  { value: 'w', label: 'Mingguan' },
  { value: 'm', label: 'Bulanan' },
];
const AGG_NOUN: Record<Aggregation, string> = { d: 'harian', w: 'mingguan', m: 'bulanan' };
const VALUE_FORMAT = {
  nominal: 'rupiah',
  gram: 'rupiah',
  index: 'number',
  pct: 'percent',
} as const;

function chartTitle(mode: ValueMode, agg: Aggregation): string {
  const head = {
    nominal: 'Harga emas',
    gram: 'Harga emas per gram',
    index: 'Indeks harga (=100 di awal rentang)',
    pct: 'Perubahan harga sejak awal rentang',
  }[mode];
  return `${head} · ${AGG_NOUN[agg]}`;
}

function seriesMeta(o: ExplorerOption, price: PriceField, perGram = false): string {
  const first = o.first[price];
  return [
    o.kind === 'fisik' && !perGram ? 'per keping' : 'per gram',
    o.source === 'logammulia' && price === 'sell' ? 'harga dasar' : null,
    first ? `sejak ${formatDate(first)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Swatch({ color, dashed, width = 26 }: { color: string; dashed: boolean; width?: number }) {
  return (
    <svg
      width={width}
      height="10"
      viewBox={`0 0 ${width} 10`}
      aria-hidden="true"
      className="flex-none"
    >
      <path
        d={`M1 5 H${width - 1}`}
        fill="none"
        stroke={colorVar(color as never)}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 3' : undefined}
      />
    </svg>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-10 text-center text-sm text-muted">{children}</p>;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function ExplorerBoard({ options, asOf, stamps, calendar }: ExplorerBoardProps) {
  const [query, setQuery] = useQueryStates(
    {
      s: parseAsString,
      r: parseAsString,
      m: parseAsString,
      agg: parseAsString,
      band: parseAsString,
      ffill: parseAsString,
    },
    { history: 'replace' },
  );
  const range = useMemo(() => decodeRange(query.r), [query.r]);
  const view: ViewOptions = useMemo(
    () => ({
      mode: decodeMode(query.m),
      agg: decodeAgg(query.agg),
      band: decodeFlag(query.band),
      ffill: decodeFlag(query.ffill),
    }),
    [query.m, query.agg, query.band, query.ffill],
  );
  const bandOn = view.band && view.agg !== 'd';
  const setView = useCallback(
    (patch: Partial<ViewOptions>) => {
      const n = { ...view, ...patch };
      void setQuery({
        m: encodeMode(n.mode),
        agg: encodeAgg(n.agg),
        band: encodeFlag(n.band),
        ffill: encodeFlag(n.ffill),
      });
    },
    [view, setQuery],
  );
  const active = useMemo(
    () =>
      decodePicks(query.s).flatMap((pick) => {
        const opt = resolvePick(pick, options);
        return opt ? [{ pick, opt, id: encodePick(pick) }] : [];
      }),
    [query.s, options],
  );

  const setPicks = useCallback(
    (next: SeriesPick[]) =>
      void setQuery({ s: samePicks(next, DEFAULT_PICKS) ? null : encodePicks(next) }),
    [setQuery],
  );
  const setRange = useCallback(
    (r: RangeValue, fromChart = false) => {
      const code = encodeRange(r);
      void setQuery(
        { r: code === encodeRange(DEFAULT_RANGE) ? null : code },
        fromChart ? { limitUrlUpdates: debounce(300) } : undefined,
      );
    },
    [setQuery],
  );

  // --- Data ---------------------------------------------------------------
  const needed = useMemo(() => uniq(active.map((a) => a.opt.file)), [active]);
  const { files, loading, error } = useSeriesFiles(needed);

  const built = useMemo(() => {
    if (loading) return null;
    return active.map((a) => {
      const file = files[a.opt.file];
      const points: SeriesPoint[] = file ? seriesPoints(file, a.opt, a.pick.price) : [];
      return { ...a, points, chart: chartPoints(points, expectedFor(calendar, [a.opt.source])) };
    });
  }, [active, files, loading, calendar]);

  const lastDate = useMemo(
    () =>
      built
        ?.map((b) => b.points.at(-1)?.date ?? '')
        .sort()
        .at(-1) || asOf,
    [built, asOf],
  );
  const minDate = useMemo(
    () => built?.map((b) => b.points[0]?.date ?? '9999').sort()[0] ?? null,
    [built],
  );
  const eff = effectiveRange(range, lastDate, minDate === '9999' ? null : minDate);

  // Titik tampilan per series: agregasi -> isi celah (opsional) -> mode nilai (P4-01..03).
  const shown = useMemo(
    () =>
      (built ?? []).map((b) => {
        let vp = aggregateClose(b.points, view.agg);
        if (view.ffill) vp = fillGaps(vp, view.agg, expectedFor(calendar, [b.opt.source]));
        vp = applyMode(vp, view.mode, gramDivisor(b.opt), eff.from, eff.to);
        // Isi celah aktif: tidak ada celah untuk digambar (nilai disalin dan diberi penanda).
        const gaps = view.ffill ? [] : viewGaps(b.chart.gaps, view.agg);
        return { b, vp, gaps };
      }),
    [built, view, calendar, eff.from, eff.to],
  );
  const series: TimeSeries[] = useMemo(
    () =>
      shown.map(({ b, vp, gaps: own }) => ({
        id: b.id,
        label: seriesLabel(b.opt, b.pick.price),
        color: optionColor(b.opt),
        dashed: b.pick.price === 'buyback',
        width: b.pick.price === 'buyback' ? 1.8 : 2.2,
        points: viewChartPoints(vp, own, view.ffill),
        envelope: bandOn
          ? {
              min: vp.flatMap((p): [string, number][] => (p.min === null ? [] : [[p.date, p.min]])),
              max: vp.flatMap((p): [string, number][] => (p.max === null ? [] : [[p.date, p.max]])),
            }
          : undefined,
        notes: view.ffill ? fillNotes(vp) : undefined,
      })),
    [shown, view.ffill, bandOn],
  );
  const gaps = useMemo(() => labelGaps(mergeGaps(shown.map((x) => x.gaps))), [shown]);
  const chartRange = useMemo(
    () => (eff.from ? { from: eff.from, to: eff.to } : undefined),
    [eff.from, eff.to],
  );
  const onChartRange = useCallback(
    (r: { from: string; to: string }) => {
      if (r.from === eff.from && r.to === eff.to) return;
      setRange({ from: r.from, to: r.to }, true);
    },
    [eff.from, eff.to, setRange],
  );

  // Ringkasan memakai harga harian asli (tanpa agregasi/isi celah); mode per gram ikut dibagi.
  const stats = useMemo(
    () =>
      (built ?? []).map((b) => {
        const d = view.mode === 'gram' ? gramDivisor(b.opt) : 1;
        const pts = d === 1 ? b.points : b.points.map((p) => ({ ...p, value: p.value / d }));
        return { b, s: rangeStats(pts, eff.from, eff.to) };
      }),
    [built, eff.from, eff.to, view.mode],
  );

  // --- Pemilih series -----------------------------------------------------
  const [kind, setKind] = useState<ProductKind>('fisik');
  const [brandSel, setBrandSel] = useState<Brand>('antam');
  const [sourceSel, setSourceSel] = useState<PriceSource>('logammulia');
  const [wSel, setWSel] = useState('1');
  const [priceSel, setPriceSel] = useState<PriceField>('sell');

  const ofKind = options.filter((o) => o.kind === kind);
  const brands = uniq(ofKind.map((o) => o.brand));
  const brand = brands.includes(brandSel) ? brandSel : brands[0];
  const sources = uniq(ofKind.filter((o) => o.brand === brand).map((o) => o.source));
  const source = sources.includes(sourceSel) ? sourceSel : sources[0];
  const weights = ofKind
    .filter((o) => o.brand === brand && o.source === source)
    .sort((a, b) => a.w - b.w);
  const opt =
    weights.find((o) => String(o.w) === wSel) ?? weights.find((o) => o.w === 1) ?? weights[0];
  const prices = (['sell', 'buyback'] as const).filter((p) => opt?.first[p] != null);
  const price = prices.includes(priceSel) ? priceSel : prices[0];
  const candidate: SeriesPick | null =
    opt && price ? { source: opt.source, brand: opt.brand, w: opt.w, price } : null;
  const duplicate = candidate ? active.some((a) => a.id === encodePick(candidate)) : false;
  const full = active.length >= MAX_SERIES;

  // --- Tautan -------------------------------------------------------------
  const [base, setBase] = useState('');
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  useEffect(() => setBase(window.location.origin + window.location.pathname), []);
  const shareUrl =
    `${base}?s=${encodePicks(active.map((a) => a.pick))}&r=${encodeRange(range)}` +
    [
      ['m', encodeMode(view.mode)],
      ['agg', encodeAgg(view.agg)],
      ['band', encodeFlag(view.band)],
      ['ffill', encodeFlag(view.ffill)],
    ]
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `&${k}=${v}`)
      .join('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied('ok');
    } catch {
      setCopied('fail');
      (document.getElementById('share') as HTMLInputElement | null)?.select();
    }
  }

  const chartH = useChartHeight(380, 300);

  const stampSources = uniq(active.map((a) => a.opt.source));
  const hasLate = stats.some((x) => x.s?.startsLate);

  return (
    <section className="wrap flex flex-col gap-5 pb-16 lg:flex-row-reverse lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className={PANEL_SM}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="m-0 text-[17px] font-semibold">{chartTitle(view.mode, view.agg)}</h2>
              <p className="num m-0 mt-0.5 text-[13px] text-muted">
                {eff.from ? `${formatDate(eff.from)} – ` : 'sampai '}
                {formatDate(eff.to)} · {formatNumber(active.length)} series
              </p>
            </div>
            <RangeControl
              size="sm"
              value={range}
              onChange={(r) => setRange(r)}
              lastDate={lastDate}
              minDate={minDate && minDate !== '9999' ? minDate : undefined}
            />
          </div>
          {error ? (
            <Hint>Data gagal dimuat. Muat ulang halaman.</Hint>
          ) : active.length === 0 ? (
            <Hint>Tambahkan minimal satu series untuk menampilkan grafik.</Hint>
          ) : loading || !built ? (
            <Hint>Memuat data…</Hint>
          ) : (
            <TimeSeriesChart
              series={series}
              gaps={gaps}
              showZoom
              legend={false}
              valueFormat={VALUE_FORMAT[view.mode]}
              height={chartH}
              range={chartRange}
              onRangeChange={onChartRange}
              ariaLabel={`Grafik harga: ${series.map((s) => s.label).join(', ')}`}
            />
          )}
          <p className="m-0 mt-3 text-xs leading-relaxed text-faint">
            Gulir untuk zoom, seret untuk geser. Area berarsir = hari terbit tanpa data dari sumber
            (garis diputus). Akhir pekan dan hari libur ketika sumber memang tidak terbit tidak
            dihitung sebagai celah. Emas fisik: harga per keping; Tabungan Emas: harga per gram.
            {hasLate ? ' Series yang lebih pendek mulai dari tanggal datanya yang pertama.' : ''}
            {view.mode === 'gram' ? ' Mode per gram: harga keping dibagi beratnya.' : ''}
            {view.mode === 'index' || view.mode === 'pct'
              ? ' Indeks dan % ubah dihitung per series dari titik pertamanya yang terlihat di rentang; mengubah rentang menghitung ulang dasar.'
              : ''}
            {view.agg !== 'd'
              ? ` Titik ${AGG_NOUN[view.agg]} = harga penutupan periode (hari data terakhir).`
              : ''}
            {bandOn ? ' Pita = harga terendah sampai tertinggi dalam periode.' : ''}
            {view.ffill
              ? ' Isi celah aktif: nilai yang disalin dari hari sebelumnya ditandai "isi dari ..." di tooltip dan bukan data baru dari sumber.'
              : ''}
          </p>

          {built && built.length > 0 ? (
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5">
              {stats.map(({ b, s }) => (
                <div
                  key={b.id}
                  className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-line px-3.5 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
                    <Swatch
                      color={optionColor(b.opt)}
                      dashed={b.pick.price === 'buyback'}
                      width={20}
                    />
                    <span className="min-w-0 break-words">{seriesLabel(b.opt, b.pick.price)}</span>
                  </span>
                  <span className="num text-lg font-semibold">
                    {s ? formatRupiah(s.last.value) : EMPTY}
                  </span>
                  <span
                    className={cn(
                      'num text-[12.5px]',
                      s ? DIR_CLASS[changeDirection(s.changePct)] : 'text-muted',
                    )}
                  >
                    {s ? formatPct(s.changePct) : 'Tidak ada data di rentang ini'}{' '}
                    {s ? <span className="text-faint">dalam rentang</span> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-1">
            {stampSources.map((src) => {
              const st = stamps[src];
              const date =
                st?.date ??
                built
                  ?.filter((b) => b.opt.source === src)
                  .map((b) => b.points.at(-1)?.date ?? '')
                  .sort()
                  .at(-1) ??
                asOf;
              return (
                <SourceStamp key={src} source={src} date={date || asOf} at={st?.at ?? null}>
                  {active
                    .filter((a) => a.opt.source === src)
                    .map((a) => displayBrand(a.opt))
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .join(', ')}
                </SourceStamp>
              );
            })}
          </div>
        </div>

        <div className={cn(CARD, 'flex flex-wrap items-center gap-3 px-5 py-[18px]')}>
          <label htmlFor="share" className="flex-none text-[13px] font-semibold">
            Tautan konfigurasi
          </label>
          <input
            id="share"
            readOnly
            value={base ? shareUrl : ''}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(FIELD, 'num min-w-0 flex-[1_1_320px] text-[12.5px] text-muted')}
          />
          <button
            type="button"
            onClick={copy}
            className="min-h-11 cursor-pointer rounded-xl border-0 bg-btn px-[18px] text-[13.5px] font-semibold text-btntext"
          >
            Salin tautan
          </button>
          <Link
            href="/data"
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[13.5px] font-semibold text-text no-underline hover:text-gold"
          >
            Unduh CSV di halaman Data
          </Link>
          <p role="status" className="m-0 basis-full text-xs text-muted empty:hidden">
            {copied === 'ok'
              ? 'Tautan disalin.'
              : copied === 'fail'
                ? 'Tidak bisa menyalin otomatis. Tautan sudah dipilih, tekan Ctrl+C.'
                : ''}
          </p>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
          <h2 className="m-0 px-5 py-[18px] text-[15px] font-semibold">Ringkasan rentang</h2>
          <div className="overflow-x-auto">
            <div role="table" aria-label="Ringkasan rentang" className="min-w-[720px]">
              <div
                role="row"
                className={cn(
                  GRID,
                  'border-t border-line py-2.5 text-[11.5px] font-semibold uppercase tracking-[.1em] text-faint',
                )}
              >
                <span role="columnheader">Series</span>
                <span role="columnheader">Awal</span>
                <span role="columnheader">Akhir</span>
                <span role="columnheader">Terendah</span>
                <span role="columnheader">Tertinggi</span>
                <span role="columnheader">Hari tanpa data</span>
              </div>
              {stats.length === 0 ? (
                <p className="m-0 border-t border-line px-5 py-4 text-[13px] text-muted">
                  {loading ? 'Memuat data…' : 'Belum ada series aktif.'}
                </p>
              ) : null}
              {stats.map(({ b, s }) => (
                <div
                  key={b.id}
                  role="row"
                  className={cn(GRID, 'items-center border-t border-line py-3 text-[13.5px]')}
                >
                  <span role="cell" className="flex min-w-0 items-center gap-2 pr-2 font-semibold">
                    <span
                      className="size-2 flex-none rounded-[2px]"
                      style={{ background: colorVar(optionColor(b.opt)) }}
                    />
                    <span className="min-w-0">{seriesLabel(b.opt, b.pick.price)}</span>
                  </span>
                  <span role="cell" className="num">
                    {s ? formatRupiah(s.first.value) : EMPTY}
                    {s?.startsLate ? (
                      <span className="block text-xs text-muted">
                        mulai {formatDate(s.first.date)}
                      </span>
                    ) : null}
                  </span>
                  <span role="cell" className="num">
                    {s ? formatRupiah(s.last.value) : EMPTY}
                  </span>
                  <span role="cell" className="num">
                    {s ? formatRupiah(s.min.value) : EMPTY}
                    {s ? (
                      <span className="block text-xs text-muted">{formatDate(s.min.date)}</span>
                    ) : null}
                  </span>
                  <span role="cell" className="num">
                    {s ? formatRupiah(s.max.value) : EMPTY}
                    {s ? (
                      <span className="block text-xs text-muted">{formatDate(s.max.date)}</span>
                    ) : null}
                  </span>
                  <span role="cell" className="num text-muted">
                    {s ? formatNumber(s.missingDays) : EMPTY}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <aside
        aria-label="Pengaturan grafik"
        className="flex min-w-0 flex-col gap-3 lg:w-[300px] lg:flex-none"
      >
        <div className={cn(CARD, 'flex flex-col gap-2')}>
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[15px] font-semibold">Series aktif</h2>
            <span className="text-xs text-faint">
              {active.length} dari maks. {MAX_SERIES}
            </span>
          </div>
          {active.length === 0 ? (
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              Belum ada series. Pilih di bawah lalu tambahkan ke grafik.
            </p>
          ) : null}
          {active.map((a) => {
            const label = seriesLabel(a.opt, a.pick.price);
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl bg-surface2 px-3 py-1.5"
              >
                <Swatch color={optionColor(a.opt)} dashed={a.pick.price === 'buyback'} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{label}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {seriesMeta(a.opt, a.pick.price, view.mode === 'gram')}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Hapus series ${label}`}
                  onClick={() => setPicks(active.filter((x) => x.id !== a.id).map((x) => x.pick))}
                  className="-my-2 -mr-2 grid size-11 flex-none cursor-pointer place-items-center border-0 bg-transparent text-faint hover:text-text"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="fill-none stroke-current stroke-2"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <details open className={cn(CARD, 'group flex flex-col gap-3')}>
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <h2 className="m-0 text-[15px] font-semibold">Tambah series</h2>
            <span aria-hidden="true" className="text-xs text-faint group-open:rotate-180">
              ▾
            </span>
          </summary>
          <Segmented
            label="Produk"
            className="grid grid-cols-2"
            options={(['fisik', 'tabungan'] as const).map((k) => ({
              value: k,
              label: PRODUCT_KIND_LABELS[k],
            }))}
            value={kind}
            onChange={setKind}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
              Brand
              <select
                className={FIELD}
                value={brand}
                onChange={(e) => setBrandSel(e.target.value as Brand)}
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {displayBrand({
                      brand: b,
                      product: kind === 'tabungan' ? 'gold_savings' : 'gold_bar',
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
              Sumber
              <select
                className={FIELD}
                value={source}
                onChange={(e) => setSourceSel(e.target.value as PriceSource)}
              >
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
              Gramasi
              <select
                className={FIELD}
                value={opt ? String(opt.w) : ''}
                onChange={(e) => setWSel(e.target.value)}
              >
                {weights.map((o) => (
                  <option key={o.id} value={String(o.w)}>
                    {o.kind === 'tabungan' ? 'per gram' : formatWeight(o.w)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted">
              Jenis harga
              <select
                className={FIELD}
                value={price}
                onChange={(e) => setPriceSel(e.target.value as PriceField)}
              >
                {prices.map((p) => (
                  <option key={p} value={p}>
                    {PRICE_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {opt && !opt.first.buyback ? (
            <p className="m-0 text-xs text-faint">
              {SOURCE_LABELS[opt.source]} tidak menampilkan buyback untuk gramasi ini.
            </p>
          ) : null}
          <button
            type="button"
            disabled={!candidate || duplicate || full}
            onClick={() => candidate && setPicks([...active.map((a) => a.pick), candidate])}
            className="min-h-11 cursor-pointer rounded-xl border border-dashed border-goldline bg-goldsoft text-sm font-semibold text-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {duplicate
              ? 'Sudah ada di grafik'
              : full
                ? `Maksimum ${MAX_SERIES} series`
                : '+ Tambah ke grafik'}
          </button>
        </details>

        <details open className={cn(CARD, 'group flex flex-col gap-3')}>
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <h2 className="m-0 text-[15px] font-semibold">Tampilan</h2>
            <span aria-hidden="true" className="text-xs text-faint group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">Mode nilai</span>
            <Segmented
              label="Mode nilai"
              className="grid grid-cols-2"
              options={MODE_OPTIONS}
              value={view.mode}
              onChange={(mode) => setView({ mode })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">Agregasi (penutupan periode)</span>
            <Segmented
              label="Agregasi"
              className="grid grid-cols-3"
              options={AGG_OPTIONS}
              value={view.agg}
              onChange={(agg) => setView({ agg })}
            />
          </div>
          <label
            className={cn(
              'flex min-h-11 items-start gap-3 text-[13.5px] leading-snug',
              view.agg === 'd' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
          >
            <input
              type="checkbox"
              checked={bandOn}
              disabled={view.agg === 'd'}
              onChange={(e) => setView({ band: e.target.checked })}
              className="mt-0.5 size-[18px] accent-gold"
            />
            <span>
              Pita min–maks
              <br />
              <span className="text-xs text-muted">
                Terendah–tertinggi dalam periode. Hanya untuk agregasi mingguan/bulanan.
              </span>
            </span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[13.5px] leading-snug">
            <input
              type="checkbox"
              checked={view.ffill}
              onChange={(e) => setView({ ffill: e.target.checked })}
              className="mt-0.5 size-[18px] accent-gold"
            />
            <span>
              Isi celah (forward-fill)
              <br />
              <span className="text-xs text-muted">
                Hanya tampilan, diberi penanda. Default: celah tetap terlihat.
              </span>
            </span>
          </label>
        </details>
      </aside>
    </section>
  );
}
