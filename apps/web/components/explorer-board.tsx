'use client';

import type { Brand, PriceSource } from '@gold/schema';
import { debounce, parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { RangeControl, type RangeValue } from '@/components/range-control';
import { Segmented } from '@/components/segmented';
import { InfoPopover } from '@/components/info-popover';
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
  decodeFlagOn,
  decodeMode,
  DEFAULT_RANGE,
  decodePicks,
  decodeRange,
  effectiveRange,
  encodeAgg,
  encodeFlag,
  encodeFlagOn,
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
const PANEL_SM = 'min-w-0 rounded-card border border-line bg-surface p-4';
const PRICE_LABEL: Record<PriceField, string> = { sell: 'Jual', buyback: 'Buyback' };
const DIR_CLASS = { up: 'text-up', down: 'text-down', flat: 'text-muted' } as const;
// Bagian panel: kartu di tablet/desktop, polos dipisah garis di lembar HP.
const SECTION =
  'min-w-0 rounded-[18px] border border-line bg-surface p-5 max-sm:rounded-none max-sm:border-0 max-sm:border-t max-sm:bg-transparent max-sm:px-0 max-sm:py-4';
const FIELD_LABEL = 'flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted';
const GROUP_LABEL = 'text-xs font-medium text-muted';
const GRID = 'grid grid-cols-[minmax(220px,2fr)_repeat(4,minmax(100px,1fr))] px-5';

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

/** Judul ringkas di panel: brand + gramasi (sumber dan jenis harga ditampilkan terpisah). */
function seriesTitle(o: ExplorerOption): string {
  return [displayBrand(o), o.kind === 'fisik' ? formatWeight(o.w) : null]
    .filter(Boolean)
    .join(' · ');
}

function PriceTag({ price }: { price: PriceField }) {
  return (
    <span className="flex-none rounded-full border border-line bg-surface px-1.5 py-px text-2xs font-semibold uppercase tracking-[.06em] text-muted">
      {PRICE_LABEL[price]}
    </span>
  );
}

function SectionSummary({ children }: { children: React.ReactNode }) {
  return (
    <summary className="-my-1 flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
      <h2 className="m-0 text-base font-semibold">{children}</h2>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="flex-none fill-none stroke-current stroke-2 text-faint transition-transform group-open:rotate-180"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </summary>
  );
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
      ffill: decodeFlagOn(query.ffill),
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
        ffill: encodeFlagOn(n.ffill),
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
  const addNote = duplicate
    ? 'Series ini sudah ada di grafik.'
    : full
      ? `Maksimum ${MAX_SERIES} series. Hapus salah satu untuk menambah.`
      : opt && !opt.first.buyback
        ? `${SOURCE_LABELS[opt.source]} tidak menampilkan buyback untuk gramasi ini.`
        : null;

  // HP (< 640 px): panel pengaturan jadi lembar dari bawah (bottom sheet, D-54).
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);
  const chartH = useChartHeight(400, 240);

  const stampSources = uniq(active.map((a) => a.opt.source));
  const hasLate = stats.some((x) => x.s?.startsLate);

  return (
    <section className="wrap flex flex-col gap-5 pb-16 lg:flex-row-reverse lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className={PANEL_SM}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              {/* Di HP popover dijangkarkan ke baris judul (bukan ikon) agar tidak meluber ke kanan. */}
              <div className="relative flex items-center gap-2">
                <h2 className="m-0 text-xl font-semibold max-sm:text-lg">
                  {chartTitle(view.mode, view.agg)}
                </h2>
                <InfoPopover ariaLabel="Keterangan grafik" className="max-sm:static">
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                    <li>Gulir untuk memperbesar, seret untuk menggeser.</li>
                    {view.ffill ? (
                      <li>
                        Hari yang seharusnya ada harga tapi datanya kosong diisi harga terakhir
                        sebelumnya (tertulis &ldquo;isi dari …&rdquo; di tooltip). Matikan Isi celah
                        untuk melihat hari yang kosong.
                      </li>
                    ) : (
                      <li>
                        Area berarsir: hari yang seharusnya ada harga tapi datanya kosong. Garis
                        terputus di sana.
                      </li>
                    )}
                    <li>
                      Akhir pekan dan hari libur saat sumber tidak terbit tidak dianggap kosong.
                    </li>
                    <li>Emas fisik: harga per keping. Tabungan Emas: harga per gram.</li>
                    {hasLate ? (
                      <li>
                        Garis yang lebih pendek berarti datanya baru tersedia sejak titik awalnya.
                      </li>
                    ) : null}
                    {view.mode === 'gram' ? <li>Per gram: harga keping dibagi beratnya.</li> : null}
                    {view.mode === 'index' || view.mode === 'pct' ? (
                      <li>
                        Indeks dan % ubah diukur dari titik pertama yang terlihat. Mengganti rentang
                        ikut mengganti titik awalnya.
                      </li>
                    ) : null}
                    {view.agg !== 'd' ? (
                      <li>
                        Satu titik = harga hari terakhir yang ada datanya di tiap{' '}
                        {view.agg === 'w' ? 'minggu' : 'bulan'}.
                      </li>
                    ) : null}
                    {bandOn ? (
                      <li>Pita: rentang harga terendah sampai tertinggi di tiap periode.</li>
                    ) : null}
                  </ul>
                </InfoPopover>
              </div>
              <p className="num m-0 mt-0.5 text-sm text-muted">
                {eff.from ? `${formatDate(eff.from)} – ` : 'sampai '}
                {formatDate(eff.to)} · {formatNumber(active.length)} series
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-expanded={sheetOpen}
              aria-controls="explorer-settings"
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control border border-goldline bg-goldsoft px-3.5 text-sm font-semibold text-gold-strong sm:hidden"
            >
              Atur series ({active.length})
            </button>
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

          {built && built.length > 0 ? (
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5">
              {stats.map(({ b, s }) => (
                <div
                  key={b.id}
                  className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-line px-3.5 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
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
                      'num text-xs',
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

          <InfoPopover label="Sumber" ariaLabel="Sumber data" side="top" className="mt-4">
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
                <SourceStamp key={src} source={src} date={date || asOf} at={st?.at ?? null} bare>
                  {active
                    .filter((a) => a.opt.source === src)
                    .map((a) => displayBrand(a.opt))
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .join(', ')}
                </SourceStamp>
              );
            })}
          </InfoPopover>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
          <h2 className="m-0 px-5 py-[18px] text-base font-semibold">Ringkasan rentang</h2>
          <div className="overflow-x-auto">
            <div role="table" aria-label="Ringkasan rentang" className="min-w-[620px]">
              <div
                role="row"
                className={cn(
                  GRID,
                  'border-t border-line py-2.5 text-2xs font-semibold uppercase tracking-[.1em] text-faint',
                )}
              >
                <span role="columnheader">Series</span>
                <span role="columnheader">Awal</span>
                <span role="columnheader">Akhir</span>
                <span role="columnheader">Terendah</span>
                <span role="columnheader">Tertinggi</span>
              </div>
              {stats.length === 0 ? (
                <p className="m-0 border-t border-line px-5 py-4 text-sm text-muted">
                  {loading ? 'Memuat data…' : 'Belum ada series aktif.'}
                </p>
              ) : null}
              {stats.map(({ b, s }) => (
                <div
                  key={b.id}
                  role="row"
                  className={cn(GRID, 'items-center border-t border-line py-3 text-sm')}
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
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {sheetOpen ? (
        <div
          aria-hidden="true"
          onClick={() => setSheetOpen(false)}
          className="fixed inset-0 z-50 bg-black/40 sm:hidden"
        />
      ) : null}
      <aside
        id="explorer-settings"
        aria-label="Pengaturan grafik"
        className={cn(
          'flex min-w-0 flex-col gap-3 sm:max-lg:grid sm:max-lg:grid-cols-2 sm:max-lg:items-start sm:max-lg:gap-4 lg:w-[320px] lg:flex-none',
          // HP: lembar dari bawah; bagian tanpa kartu, dipisah garis (D-54, D-55).
          'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50 max-sm:max-h-[85dvh] max-sm:gap-0 max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:rounded-t-card max-sm:border-t max-sm:border-line max-sm:bg-bg max-sm:px-[18px] max-sm:pb-[calc(16px+env(safe-area-inset-bottom))]',
          !sheetOpen && 'max-sm:hidden',
        )}
      >
        <div className="sticky top-0 z-10 -mx-[18px] flex flex-col bg-bg px-[18px] pb-3 pt-2 sm:hidden">
          <span aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold">Pengaturan grafik</span>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="min-h-10 cursor-pointer rounded-control bg-btn px-4 text-sm font-semibold text-btntext"
            >
              Selesai
            </button>
          </div>
        </div>

        <section aria-labelledby="active-title" className={cn(SECTION, 'flex flex-col gap-3')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="active-title" className="m-0 text-base font-semibold">
              Series aktif
            </h2>
            <span className="num text-xs text-faint">
              {active.length} dari maks. {MAX_SERIES}
            </span>
          </div>
          {active.length === 0 ? (
            <p className="m-0 rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm leading-relaxed text-muted">
              Belum ada series. Pilih di bagian Tambah series.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {active.map((a) => {
                const label = seriesLabel(a.opt, a.pick.price);
                return (
                  <li
                    key={a.id}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface2 py-2 pl-3 pr-1"
                  >
                    <Swatch
                      color={optionColor(a.opt)}
                      dashed={a.pick.price === 'buyback'}
                      width={20}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="min-w-0 break-words text-sm font-semibold leading-snug">
                          {seriesTitle(a.opt)}
                        </span>
                        <PriceTag price={a.pick.price} />
                      </div>
                      <div className="mt-0.5 break-words text-xs leading-snug text-muted">
                        {SOURCE_LABELS[a.opt.source]} ·{' '}
                        {seriesMeta(a.opt, a.pick.price, view.mode === 'gram')}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Hapus series ${label}`}
                      title="Hapus dari grafik"
                      onClick={() =>
                        setPicks(active.filter((x) => x.id !== a.id).map((x) => x.pick))
                      }
                      className="grid size-10 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint transition-colors hover:bg-surface hover:text-text"
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
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <details open className={cn(SECTION, 'group')}>
          <SectionSummary>Tambah series</SectionSummary>
          <div className="mt-3 flex flex-col gap-3">
            <Segmented
              label="Produk"
              size="sm"
              className="grid w-full grid-cols-2"
              options={(['fisik', 'tabungan'] as const).map((k) => ({
                value: k,
                label: PRODUCT_KIND_LABELS[k],
              }))}
              value={kind}
              onChange={setKind}
            />
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
              <label className={FIELD_LABEL}>
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
              <label className={FIELD_LABEL}>
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
              <label className={FIELD_LABEL}>
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
              <label className={FIELD_LABEL}>
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
            {opt && price ? (
              <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-dashed border-line px-3 py-2.5">
                <Swatch color={optionColor(opt)} dashed={price === 'buyback'} width={20} />
                <span className="min-w-0 flex-1 break-words text-xs leading-snug text-muted">
                  <span className="font-semibold text-text">{seriesTitle(opt)}</span> ·{' '}
                  {SOURCE_LABELS[opt.source]} · {PRICE_LABEL[price]}
                </span>
              </div>
            ) : null}
            <button
              type="button"
              disabled={!candidate || duplicate || full}
              onClick={() => candidate && setPicks([...active.map((a) => a.pick), candidate])}
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-btn text-sm font-semibold text-btntext disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-faint"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="fill-none stroke-current stroke-[2.4]"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Tambah ke grafik
            </button>
            {addNote ? (
              <p role="status" className="m-0 text-xs leading-relaxed text-muted">
                {addNote}
              </p>
            ) : null}
          </div>
        </details>

        <details open className={cn(SECTION, 'group sm:max-lg:col-span-2')}>
          <SectionSummary>Tampilan</SectionSummary>
          <div className="mt-3 grid gap-4 sm:max-lg:grid-cols-2 sm:max-lg:gap-x-6">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className={GROUP_LABEL}>Mode nilai</span>
                <Segmented
                  label="Mode nilai"
                  size="sm"
                  className="grid w-full grid-cols-4 [&>button]:min-w-0 [&>button]:px-1"
                  options={MODE_OPTIONS}
                  value={view.mode}
                  onChange={(mode) => setView({ mode })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={GROUP_LABEL}>Agregasi · harga penutupan periode</span>
                <Segmented
                  label="Agregasi"
                  size="sm"
                  className="grid w-full grid-cols-3"
                  options={AGG_OPTIONS}
                  value={view.agg}
                  onChange={(agg) => setView({ agg })}
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={GROUP_LABEL}>Opsi grafik</span>
              <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 text-sm leading-snug">
                  <input
                    type="checkbox"
                    checked={view.ffill}
                    onChange={(e) => setView({ ffill: e.target.checked })}
                    className="mt-0.5 size-[18px] flex-none accent-gold"
                  />
                  <span>
                    Isi celah (forward-fill)
                    <span className="mt-0.5 block text-xs text-muted">
                      Hari tanpa data memakai nilai sebelumnya, ditandai di tooltip. Matikan untuk
                      melihat celah.
                    </span>
                  </span>
                </label>
                <label
                  className={cn(
                    'flex min-h-11 items-start gap-3 px-3 py-2.5 text-sm leading-snug',
                    view.agg === 'd' ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={bandOn}
                    disabled={view.agg === 'd'}
                    onChange={(e) => setView({ band: e.target.checked })}
                    className="mt-0.5 size-[18px] flex-none accent-gold disabled:opacity-50"
                  />
                  <span className={view.agg === 'd' ? 'text-muted' : undefined}>
                    Pita min–maks
                    <span className="mt-0.5 block text-xs text-muted">
                      {view.agg === 'd'
                        ? 'Pilih agregasi mingguan atau bulanan untuk mengaktifkan.'
                        : 'Rentang terendah–tertinggi dalam periode.'}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </details>
      </aside>
    </section>
  );
}
