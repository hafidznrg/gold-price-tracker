'use client';

import type { PriceSource } from '@gold/schema';
import { debounce, parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo, useRef, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { AdvancedDialog, type ListedSeries } from '@/components/explorer-advanced';
import {
  AGG_NOUN,
  DIR_CLASS,
  Hint,
  seriesLabel,
  seriesParts,
  Swatch,
  uniq,
  VALUE_FORMAT,
} from '@/components/explorer-parts';
import { ExplorerToolbar } from '@/components/explorer-toolbar';
import { InfoPopover } from '@/components/info-popover';
import type { RangeValue } from '@/components/range-control';
import { SourceStamp } from '@/components/source-stamp';
import { useChartHeight } from '@/components/use-chart-height';
import { useSeriesFiles } from '@/components/use-series-files';
import type { ColorToken, SeriesPoint } from '@/lib/data';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import {
  aggregateClose,
  applyMode,
  chartPoints,
  decodeAgg,
  decodeFlag,
  decodeFlagOn,
  decodeMode,
  decodePicks,
  decodeRange,
  DEFAULT_RANGE,
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
  mergeGaps,
  optionBrandName,
  optionColor,
  rangeStats,
  resolvePick,
  seriesPoints,
  viewChartPoints,
  viewGaps,
  type ExplorerOption,
  type RangeStat,
  type SeriesPick,
  type ViewOptions,
  type ValueMode,
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
import type { CompareDef } from '@/lib/bandingkan';
import {
  basicEntries,
  basicPricePicks,
  decodeBrandIds,
  decodeGram,
  decodeShow,
  encodeBrandIds,
  encodeGram,
  encodeShow,
  showsPrice,
  showsSpread,
  spreadPoints,
  spreadRangeStats,
  type ShowMode,
} from '@/lib/riwayat';
import { cn } from '@/lib/utils';

export interface ExplorerBoardProps {
  options: ExplorerOption[];
  /** Gramasi yang bisa dibandingkan antar brand (`compareWeights`), dihitung di server. */
  weights: number[];
  /** Tanggal data terbaru (patokan rentang bila belum ada data termuat). */
  asOf: string;
  /** Stempel per sumber dari meta.json. */
  stamps: Partial<Record<PriceSource, { date: string | null; at: string | null }>>;
  /** Kalender terbit sumber, agar akhir pekan/libur tidak dianggap celah. */
  calendar: DataCalendar;
}

const PANEL_SM = 'min-w-0 rounded-card border border-line bg-surface p-4';
/**
 * Tabel ringkasan diatur menurut lebar kartunya sendiri (container query). Di HP tiap series
 * jadi blok ringkas: judul + Akhir di baris atas, Awal/Terendah/Tertinggi sejajar di bawahnya,
 * tanpa geser ke samping. Dari 580px kartu berubah jadi tabel 5 kolom.
 */
const SUM_WIDE = '@min-[580px]:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]';
const SUM_ROW = cn(
  'grid grid-cols-3 gap-x-3 gap-y-2.5 border-t border-line px-5 @min-[580px]:items-center',
  SUM_WIDE,
);
const SUM_CELL = 'num flex min-w-0 flex-col @min-[580px]:items-end @min-[580px]:text-right';
const SUM_CELL_LABEL =
  'mb-px text-2xs font-semibold uppercase tracking-[.08em] text-faint @min-[580px]:hidden';
/** Teks keterangan di bawah angka (tanggal, "mulai …"): di HP lebih kecil dari angkanya. */
const SUM_NOTE = 'text-[11px] leading-snug text-muted @min-[580px]:text-xs';
/** Teks utama blok (nama series, harga Akhir): di HP sedikit lebih besar dari angka lain. */
const SUM_PRIMARY = 'text-[15px] font-semibold leading-snug @min-[580px]:text-sm';

const pctPlain = (v: number) => formatPct(v, 2, false);

/** Seri satu garis: pilihan + opsi katalog (+ definisi brand di mode dasar). */
interface Line extends ListedSeries {
  def?: CompareDef;
}

function manualTitle(mode: ValueMode, agg: ViewOptions['agg']): string {
  const head = {
    nominal: 'Harga emas',
    gram: 'Harga emas per gram',
    index: 'Indeks harga (=100 di awal rentang)',
    pct: 'Perubahan harga sejak awal rentang',
  }[mode];
  return `${head} · ${AGG_NOUN[agg]}`;
}

function basicTitle(show: ShowMode, w: number, view: ViewOptions): string {
  const wl = formatWeight(w);
  const what = {
    sell: `Harga jual ${wl}`,
    bb: `Buyback ${wl}`,
    spread: `Spread ${wl}`,
    both: `Harga jual ${wl} dan spread`,
  }[show];
  const mode =
    show === 'both' || show === 'spread'
      ? ''
      : ({ nominal: '', gram: ' per gram', index: ' (indeks)', pct: ' (% ubah)' } as const)[
          view.mode
        ];
  return `${what}${mode} · ${AGG_NOUN[view.agg]}`;
}

/** Judul kecil di atas grafik harga pada tampilan Jual + spread. */
function priceChartCaption(show: ShowMode, mode: ValueMode): string {
  const what = show === 'bb' ? 'Buyback' : 'Harga jual';
  const how = {
    nominal: 'per keping',
    gram: 'per gram',
    index: '(indeks, =100 di awal rentang)',
    pct: '(% ubah sejak awal rentang)',
  }[mode];
  return `${what} ${how}`;
}

function StatCard({
  color,
  dashed,
  title,
  main,
  sub,
}: {
  color: ColorToken | string;
  dashed: boolean;
  title: string;
  main: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-line px-3.5 py-3">
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
        <Swatch color={color} dashed={dashed} width={20} />
        <span className="min-w-0 break-words">{title}</span>
      </span>
      <span className="num text-lg font-semibold">{main}</span>
      <span className="num text-xs text-muted">{sub}</span>
    </div>
  );
}

interface SummaryRow {
  key: string;
  title: string;
  meta: string;
  color: string;
  dashed: boolean;
  s: RangeStat | null;
  fmt: (v: number) => string;
  /** Persentase perubahan di sel Akhir; tidak dipakai untuk spread (selisih persen tak bermakna). */
  showChange: boolean;
}

export function ExplorerBoard({ options, weights, asOf, stamps, calendar }: ExplorerBoardProps) {
  const [query, setQuery] = useQueryStates(
    {
      s: parseAsString,
      r: parseAsString,
      m: parseAsString,
      agg: parseAsString,
      band: parseAsString,
      ffill: parseAsString,
      g: parseAsString,
      v: parseAsString,
      b: parseAsString,
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

  // Mode dasar (D-71) bila `s` tidak ada; `s` ada = mode seri manual (tautan lama).
  const manual = query.s !== null;
  const weight = decodeGram(query.g, weights);
  const show = decodeShow(query.v);
  const brandIds = useMemo(() => decodeBrandIds(query.b), [query.b]);
  const entries = useMemo(
    () => (manual ? [] : basicEntries(brandIds, weight, show, options)),
    [manual, brandIds, weight, show, options],
  );

  // Seri yang terdaftar: pilihan manual, atau (mode dasar) satu per brand tersedia.
  const listed: Line[] = useMemo(() => {
    if (manual) {
      return decodePicks(query.s).flatMap((pick) => {
        const opt = resolvePick(pick, options);
        return opt ? [{ pick, opt, id: encodePick(pick) }] : [];
      });
    }
    const picks = basicPricePicks(entries, show === 'bb' ? 'bb' : 'sell');
    return picks.map((pick, i) => ({
      pick,
      opt: entries[i]!.opt,
      id: encodePick(pick),
      color: entries[i]!.def.color,
      dashed: entries[i]!.def.dashed,
      def: entries[i]!.def,
    }));
  }, [manual, query.s, options, entries, show]);
  // Grafik harga: tak ada pada tampilan Spread.
  const active = manual || showsPrice(show) ? listed : [];

  const setPicks = useCallback(
    (next: SeriesPick[]) => void setQuery({ s: encodePicks(next) }),
    [setQuery],
  );
  const backToBasic = useCallback(() => void setQuery({ s: null }), [setQuery]);
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
  const spreadSrc = useMemo(
    () => (!manual && showsSpread(show) ? entries : []),
    [manual, show, entries],
  );
  const needed = useMemo(
    () => uniq([...active.map((a) => a.opt.file), ...spreadSrc.map((e) => e.opt.file)]),
    [active, spreadSrc],
  );
  const { files, loading, error } = useSeriesFiles(needed);

  const built = useMemo(() => {
    if (loading) return null;
    return active.map((a) => {
      const file = files[a.opt.file];
      const points: SeriesPoint[] = file ? seriesPoints(file, a.opt, a.pick.price) : [];
      return { ...a, points, chart: chartPoints(points, expectedFor(calendar, [a.opt.source])) };
    });
  }, [active, files, loading, calendar]);

  // Spread % per brand: jual dan buyback sumber yang sama pada tanggal yang sama.
  const spreadBuilt = useMemo(() => {
    if (loading) return null;
    return spreadSrc.map((e) => {
      const file = files[e.opt.file];
      const points = file
        ? spreadPoints(seriesPoints(file, e.opt, 'sell'), seriesPoints(file, e.opt, 'buyback'))
        : [];
      return { e, points, chart: chartPoints(points, expectedFor(calendar, [e.opt.source])) };
    });
  }, [spreadSrc, files, loading, calendar]);

  const lastDate = useMemo(
    () =>
      [...(built ?? []).map((b) => b.points), ...(spreadBuilt ?? []).map((b) => b.points)]
        .map((pts) => pts.at(-1)?.date ?? '')
        .sort()
        .at(-1) || asOf,
    [built, spreadBuilt, asOf],
  );
  const minDate = useMemo(() => {
    const first = [
      ...(built ?? []).map((b) => b.points),
      ...(spreadBuilt ?? []).map((b) => b.points),
    ]
      .map((pts) => pts[0]?.date ?? '9999')
      .sort()[0];
    return first && first !== '9999' ? first : null;
  }, [built, spreadBuilt]);
  const eff = effectiveRange(range, lastDate, minDate);

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
        label: b.def ? b.def.label : seriesLabel(b.opt, b.pick.price),
        color: (b.color ?? optionColor(b.opt)) as ColorToken,
        dashed: b.def ? b.def.dashed : b.pick.price === 'buyback',
        width: !b.def && b.pick.price === 'buyback' ? 1.8 : 2.2,
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

  // Spread: agregasi dan isi celah yang sama; mode nilai tidak berlaku (selalu persen).
  const spreadShown = useMemo(
    () =>
      (spreadBuilt ?? []).map((b) => {
        let vp = aggregateClose(b.points, view.agg);
        if (view.ffill) vp = fillGaps(vp, view.agg, expectedFor(calendar, [b.e.opt.source]));
        const own = view.ffill ? [] : viewGaps(b.chart.gaps, view.agg);
        return { b, vp, own };
      }),
    [spreadBuilt, view.agg, view.ffill, calendar],
  );
  const spreadSeries: TimeSeries[] = useMemo(
    () =>
      spreadShown.map(({ b, vp, own }) => ({
        id: `spread-${b.e.def.id}`,
        label: b.e.def.label,
        color: b.e.def.color,
        dashed: b.e.def.dashed,
        width: 2.2,
        points: viewChartPoints(vp, own, view.ffill),
        notes: view.ffill ? fillNotes(vp) : undefined,
      })),
    [spreadShown, view.ffill],
  );
  const spreadGaps = useMemo(
    () => labelGaps(mergeGaps(spreadShown.map((x) => x.own))),
    [spreadShown],
  );

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
  const spreadStats = useMemo(
    () =>
      (spreadBuilt ?? []).map((b) => ({
        b,
        s: spreadRangeStats(b.points, eff.from, eff.to),
        r: rangeStats(b.points, eff.from, eff.to),
      })),
    [spreadBuilt, eff.from, eff.to],
  );

  const chartH = useChartHeight(400, 240);
  const priceH2 = useChartHeight(340, 240);
  const spreadH2 = useChartHeight(270, 210);

  // --- Pop-up Lanjutan ------------------------------------------------------
  const [advOpen, setAdvOpen] = useState(false);
  const advTrigger = useRef<HTMLElement | null>(null);
  const openAdvanced = useCallback(() => {
    advTrigger.current = document.activeElement as HTMLElement | null;
    setAdvOpen(true);
  }, []);
  const closeAdvanced = useCallback(() => {
    setAdvOpen(false);
    advTrigger.current?.focus();
  }, []);

  const stampSources = uniq([...active, ...spreadSrc].map((a) => a.opt.source));
  const hasLate = stats.some((x) => x.s?.startsLate);

  // --- Judul ----------------------------------------------------------------
  const title = manual ? manualTitle(view.mode, view.agg) : basicTitle(show, weight, view);
  const countLabel = manual
    ? `${formatNumber(active.length)} series`
    : `${formatNumber(entries.length)} brand`;
  const hasLines = manual ? active.length > 0 : entries.length > 0;
  const emptyHint = manual
    ? 'Tambahkan minimal satu series untuk menampilkan grafik.'
    : entries.length === 0 && brandIds.length > 0
      ? 'Tak ada brand yang tersedia untuk pilihan ini. Ganti gramasi atau tampilan.'
      : 'Pilih minimal satu brand untuk menampilkan grafik.';
  const both = !manual && show === 'both';
  const ariaPrice = `Grafik harga: ${series.map((s) => s.label).join(', ')}`;

  const priceChart = (height: number, caption: boolean) => (
    <div className="min-w-0">
      {caption ? (
        <p className="m-0 mb-1 text-sm font-semibold">{priceChartCaption(show, view.mode)}</p>
      ) : null}
      <TimeSeriesChart
        series={series}
        gaps={gaps}
        showZoom
        legend={false}
        valueFormat={VALUE_FORMAT[view.mode]}
        height={height}
        range={chartRange}
        onRangeChange={onChartRange}
        ariaLabel={ariaPrice}
      />
    </div>
  );
  const spreadChart = (height: number, caption: boolean) => (
    <div className="min-w-0">
      {caption ? (
        <p className="m-0 mb-1 text-sm font-semibold">Spread (jual − buyback) ÷ jual</p>
      ) : null}
      <TimeSeriesChart
        series={spreadSeries}
        gaps={spreadGaps}
        showZoom
        legend={false}
        valueFormat="percent"
        height={height}
        range={chartRange}
        onRangeChange={onChartRange}
        ariaLabel={`Grafik spread: ${spreadSeries.map((s) => s.label).join(', ')}`}
      />
    </div>
  );

  // --- Kartu statistik ------------------------------------------------------
  const cards = manual
    ? stats.map(({ b, s }) => ({
        key: b.id,
        color: optionColor(b.opt) as string,
        dashed: b.pick.price === 'buyback',
        title: seriesLabel(b.opt, b.pick.price),
        main: s ? formatRupiah(s.last.value) : EMPTY,
        sub: s ? (
          <>
            <span className={DIR_CLASS[changeDirection(s.changePct)]}>
              {formatPct(s.changePct)}
            </span>{' '}
            <span className="text-faint">dalam rentang</span>
          </>
        ) : (
          'Tidak ada data di rentang ini'
        ),
      }))
    : entries.map((e) => {
        const st = stats.find((x) => x.b.def?.id === e.def.id)?.s ?? null;
        const sp = spreadStats.find((x) => x.b.e.def.id === e.def.id)?.s ?? null;
        const spread = sp ? `spread ${pctPlain(sp.last.value)}` : null;
        const base = { key: e.def.id, color: e.def.color as string, dashed: e.def.dashed };
        const title = e.def.label;
        if (show === 'spread') {
          return {
            ...base,
            title,
            main: sp ? pctPlain(sp.last.value) : EMPTY,
            sub: sp
              ? `rata-rata ${pctPlain(sp.avg)} dalam rentang`
              : 'Tidak ada data di rentang ini',
          };
        }
        const change = st ? (
          st.startsLate ? (
            <>data mulai {formatDate(st.first.date)}</>
          ) : (
            <>
              <span className={DIR_CLASS[changeDirection(st.changePct)]}>
                {formatPct(st.changePct)}
              </span>{' '}
              <span className="text-faint">dalam rentang</span>
            </>
          )
        ) : (
          'Tidak ada data di rentang ini'
        );
        return {
          ...base,
          title,
          main: st ? formatRupiah(st.last.value) : EMPTY,
          sub: spread ? (
            <>
              {change} · {spread}
            </>
          ) : (
            change
          ),
        };
      });

  // --- Baris tabel ringkasan ------------------------------------------------
  const summary: SummaryRow[] =
    !manual && show === 'spread'
      ? spreadStats.map(({ b, r }) => ({
          key: b.e.def.id,
          title: b.e.def.label,
          meta: `Spread · ${formatWeight(weight)}`,
          color: b.e.def.color,
          dashed: b.e.def.dashed,
          s: r,
          fmt: pctPlain,
          showChange: false,
        }))
      : stats.map(({ b, s }) => {
          const { title: t, meta } = seriesParts(b.opt, b.pick.price);
          return {
            key: b.id,
            title: t,
            meta,
            color: b.color ?? optionColor(b.opt),
            dashed: b.def ? b.def.dashed : b.pick.price === 'buyback',
            s,
            fmt: formatRupiah,
            showChange: true,
          };
        });
  const noRows = summary.length === 0;

  return (
    <section className="wrap flex flex-col gap-5 pb-16">
      <div className={PANEL_SM}>
        <ExplorerToolbar
          options={options}
          weights={weights}
          weight={weight}
          onWeight={(w) => void setQuery({ g: encodeGram(w) })}
          show={show}
          onShow={(v) => void setQuery({ v: encodeShow(v) })}
          brandIds={brandIds}
          onBrands={(ids) => void setQuery({ b: encodeBrandIds(ids) })}
          manual={manual}
          manualCount={active.length}
          onBack={backToBasic}
          range={range}
          onRange={(r) => setRange(r)}
          lastDate={lastDate}
          minDate={minDate ?? undefined}
          advOpen={advOpen}
          onOpenAdvanced={openAdvanced}
        />

        <div className="mb-3 min-w-0">
          {/* Di HP popover dijangkarkan ke baris judul (bukan ikon) agar tidak meluber ke kanan. */}
          <div className="relative flex items-center gap-2">
            <h2 className="m-0 text-xl font-semibold max-sm:text-lg">{title}</h2>
            <InfoPopover ariaLabel="Keterangan grafik" className="max-sm:static">
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                <li>Gulir untuk memperbesar, seret untuk menggeser.</li>
                {view.ffill ? (
                  <li>
                    Hari yang seharusnya ada harga tapi datanya kosong diisi harga terakhir
                    sebelumnya (tertulis &ldquo;isi dari …&rdquo; di tooltip). Matikan Isi hari
                    tanpa data di Lanjutan untuk melihat hari yang kosong.
                  </li>
                ) : (
                  <li>
                    Area berarsir: hari yang seharusnya ada harga tapi datanya kosong. Garis
                    terputus di sana.
                  </li>
                )}
                <li>Akhir pekan dan hari libur saat sumber tidak terbit tidak dianggap kosong.</li>
                <li>Emas fisik: harga per keping. Tabungan Emas: harga per gram.</li>
                {!manual && showsSpread(show) ? (
                  <li>
                    Spread = (harga jual − buyback) ÷ harga jual, dari sumber yang sama pada tanggal
                    yang sama. Buyback Logam Mulia selain 1 g dihitung dari buyback 1 g × berat.
                  </li>
                ) : null}
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
            {formatDate(eff.to)} · {countLabel}
          </p>
        </div>

        {error ? (
          <Hint>Data gagal dimuat. Muat ulang halaman.</Hint>
        ) : !hasLines ? (
          <Hint>{emptyHint}</Hint>
        ) : loading || !built ? (
          <Hint>Memuat data…</Hint>
        ) : both ? (
          <div className="flex flex-col gap-4">
            {priceChart(priceH2, true)}
            {spreadChart(spreadH2, true)}
          </div>
        ) : !manual && show === 'spread' ? (
          spreadChart(chartH, false)
        ) : (
          priceChart(chartH, false)
        )}

        {cards.length > 0 && !loading ? (
          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5">
            {cards.map((c) => (
              <StatCard
                key={c.key}
                color={c.color}
                dashed={c.dashed}
                title={c.title}
                main={c.main}
                sub={c.sub}
              />
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
            const names = [...active, ...spreadSrc]
              .filter((a) => a.opt.source === src)
              .map((a) => optionBrandName(a.opt))
              .filter((v, i, arr) => arr.indexOf(v) === i)
              .join(', ');
            return (
              <SourceStamp key={src} source={src} date={date || asOf} at={st?.at ?? null} bare>
                {names}
              </SourceStamp>
            );
          })}
        </InfoPopover>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
        <h2 className="m-0 px-5 py-[18px] text-base font-semibold">Ringkasan rentang</h2>
        <div className="@container">
          <div role="table" aria-label="Ringkasan rentang">
            <div
              role="row"
              className={cn(
                SUM_ROW,
                'hidden py-2.5 text-2xs font-semibold uppercase tracking-[.1em] text-faint @min-[580px]:grid',
              )}
            >
              <span role="columnheader">Series</span>
              <span role="columnheader" className="text-right">
                Awal
              </span>
              <span role="columnheader" className="text-right">
                Akhir
              </span>
              <span role="columnheader" className="text-right">
                Terendah
              </span>
              <span role="columnheader" className="text-right">
                Tertinggi
              </span>
            </div>
            {noRows ? (
              <p className="m-0 border-t border-line px-5 py-4 text-sm text-muted">
                {loading && hasLines ? 'Memuat data…' : 'Belum ada series aktif.'}
              </p>
            ) : null}
            {summary.map((row) => {
              const { s } = row;
              return (
                <div
                  key={row.key}
                  role="row"
                  className={cn(
                    SUM_ROW,
                    'py-3 text-[13px] @min-[580px]:py-3.5 @min-[580px]:text-sm',
                    // HP sangat sempit (≈320px): angka sedikit lebih kecil agar 3 kolom muat.
                    '@max-[330px]:gap-x-2 @max-[330px]:px-4 @max-[330px]:text-xs',
                  )}
                >
                  {/* HP: judul selebar baris, ruang kanannya dipakai sel Akhir (lihat di bawah). */}
                  <span
                    role="cell"
                    className="col-span-3 col-start-1 row-start-1 flex min-w-0 items-start gap-2.5 pr-[108px] @min-[580px]:col-span-1 @min-[580px]:col-start-auto @min-[580px]:row-start-auto @min-[580px]:pr-0"
                  >
                    <Swatch
                      color={row.color}
                      dashed={row.dashed}
                      width={16}
                      className="mt-[6px] flex-none @min-[580px]:mt-[5px]"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className={SUM_PRIMARY}>{row.title}</span>
                      {row.meta ? <span className="text-xs text-muted">{row.meta}</span> : null}
                    </span>
                  </span>
                  <span role="cell" className={SUM_CELL}>
                    <span aria-hidden="true" className={SUM_CELL_LABEL}>
                      Awal
                    </span>
                    <span className="whitespace-nowrap">{s ? row.fmt(s.first.value) : EMPTY}</span>
                    {s?.startsLate ? (
                      <span className={SUM_NOTE}>mulai {formatDate(s.first.date)}</span>
                    ) : null}
                  </span>
                  {/* HP: Akhir menumpang di kanan baris judul; sel lain mengalir ke baris kedua. */}
                  <span
                    role="cell"
                    className="num col-span-3 col-start-1 row-start-1 flex flex-col items-end justify-self-end text-right @min-[580px]:col-span-1 @min-[580px]:col-start-auto @min-[580px]:row-start-auto @min-[580px]:justify-self-stretch"
                  >
                    <span className={cn(SUM_PRIMARY, 'whitespace-nowrap')}>
                      {s ? row.fmt(s.last.value) : EMPTY}
                    </span>
                    {s && row.showChange ? (
                      <span
                        className={cn(
                          'text-xs font-medium',
                          DIR_CLASS[changeDirection(s.changePct)],
                        )}
                      >
                        {formatPct(s.changePct)}
                      </span>
                    ) : null}
                  </span>
                  <span role="cell" className={SUM_CELL}>
                    <span aria-hidden="true" className={SUM_CELL_LABEL}>
                      Terendah
                    </span>
                    <span className="whitespace-nowrap">{s ? row.fmt(s.min.value) : EMPTY}</span>
                    {s ? <span className={SUM_NOTE}>{formatDate(s.min.date)}</span> : null}
                  </span>
                  <span role="cell" className={SUM_CELL}>
                    <span aria-hidden="true" className={SUM_CELL_LABEL}>
                      Tertinggi
                    </span>
                    <span className="whitespace-nowrap">{s ? row.fmt(s.max.value) : EMPTY}</span>
                    {s ? <span className={SUM_NOTE}>{formatDate(s.max.date)}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AdvancedDialog
        open={advOpen}
        onClose={closeAdvanced}
        view={view}
        onView={setView}
        range={range}
        onRange={(r) => setRange(r)}
        lastDate={lastDate}
        minDate={minDate ?? undefined}
        options={options}
        listed={listed}
        manual={manual}
        onPicks={setPicks}
        onBack={backToBasic}
      />
    </section>
  );
}
