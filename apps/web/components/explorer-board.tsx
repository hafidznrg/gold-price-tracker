'use client';

import type { PriceSource } from '@gold/schema';
import { debounce, parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo, useRef, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { AdvancedDialog, type ListedSeries } from '@/components/explorer-advanced';
import { AGG_NOUN, Hint, seriesLabel, uniq, VALUE_FORMAT } from '@/components/explorer-parts';
import { ExplorerSummary } from '@/components/explorer-summary';
import { ExplorerToolbar } from '@/components/explorer-toolbar';
import { InfoPopover } from '@/components/info-popover';
import { RangeControl, type RangeValue } from '@/components/range-control';
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
  type SeriesPick,
  type ViewOptions,
  type ValueMode,
} from '@/lib/explorer';
import { formatDate, formatWeight } from '@/lib/format';
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
import {
  changeOf,
  gapAt,
  makeSpreadInfo,
  type SummaryItem,
  type SummaryMode,
} from '@/lib/riwayat-summary';

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

/** Seri satu garis: pilihan + opsi katalog (+ definisi brand di mode dasar). */
interface Line extends ListedSeries {
  def?: CompareDef;
}

/** "21 Okt – 21 Nov 2026" (tahun sekali bila sama); tanpa awal → "sampai 21 Nov 2026". */
function formatPeriod(from: string | null | undefined, to: string): string {
  if (!from) return `sampai ${formatDate(to)}`;
  return from.slice(0, 4) === to.slice(0, 4)
    ? `${formatDate(from, false)} – ${formatDate(to)}`
    : `${formatDate(from)} – ${formatDate(to)}`;
}

function manualTitle(mode: ValueMode): string {
  const head = {
    nominal: 'Harga emas',
    gram: 'Harga emas per gram',
    index: 'Indeks harga (=100 di awal rentang)',
    pct: 'Perubahan harga sejak awal rentang',
  }[mode];
  return head;
}

function basicTitle(show: ShowMode, w: number, view: ViewOptions): string {
  const wl = formatWeight(w);
  const what = {
    sell: `Harga jual ${wl}`,
    bb: `Buyback ${wl}`,
    spread: `Spread ${wl}`,
    both: `Harga jual dan spread ${wl}`,
  }[show];
  const mode =
    show === 'both' || show === 'spread'
      ? ''
      : ({ nominal: '', gram: ' per gram', index: ' (indeks)', pct: ' (% ubah)' } as const)[
          view.mode
        ];
  return `${what}${mode}`;
}

/** Label grafik harga di mode seri manual. */
function manualCaption(mode: ValueMode): string {
  return {
    nominal: 'Harga emas',
    gram: 'Harga emas per gram',
    index: 'Indeks harga (=100 di awal rentang)',
    pct: 'Perubahan harga sejak awal rentang',
  }[mode];
}

/** Label kecil di atas grafik harga (mode dasar); judul besar dihapus (D-72). */
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
      const sell = file ? seriesPoints(file, e.opt, 'sell') : [];
      const buyback = file ? seriesPoints(file, e.opt, 'buyback') : [];
      const points = spreadPoints(sell, buyback);
      return {
        e,
        points,
        sell,
        buyback,
        chart: chartPoints(points, expectedFor(calendar, [e.opt.source])),
      };
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
        const s = rangeStats(pts, eff.from, eff.to);
        // Harga terakhir per gram (sebanding antar brand), apa pun mode nilainya.
        const perGram = s ? (s.last.value * d) / gramDivisor(b.opt) : null;
        return { b, s, perGram };
      }),
    [built, eff.from, eff.to, view.mode],
  );
  const spreadStats = useMemo(
    () =>
      (spreadBuilt ?? []).map((b) => {
        const s = spreadRangeStats(b.points, eff.from, eff.to);
        return {
          b,
          s,
          r: rangeStats(b.points, eff.from, eff.to),
          gap: s ? gapAt(b.sell, b.buyback, s.last.date) : null,
        };
      }),
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
  const title = manual ? manualTitle(view.mode) : basicTitle(show, weight, view);
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
        <p className="m-0 mb-1 text-sm font-semibold">
          {manual ? manualCaption(view.mode) : priceChartCaption(show, view.mode)}
        </p>
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

  // --- Daftar "Dalam rentang ini" (D-74) -----------------------------------
  const summaryMode: SummaryMode = manual ? 'manual' : show;
  const summaryItems: SummaryItem[] = useMemo(() => {
    if (manual) {
      return stats.map(({ b, s }) => ({
        key: b.id,
        name: seriesLabel(b.opt, b.pick.price),
        source: '',
        color: optionColor(b.opt) as string,
        dashed: b.pick.price === 'buyback',
        kind: 'rupiah' as const,
        stat: s,
        change: changeOf(s, 'rupiah'),
        comparable: null,
        spread: null,
      }));
    }
    return entries.map((e): SummaryItem => {
      const base = { key: e.def.id, name: e.def.brandName, source: e.def.sourceName };
      const look = { color: e.def.color as string, dashed: e.def.dashed };
      const price = stats.find((x) => x.b.def?.id === e.def.id);
      const sp = spreadStats.find((x) => x.b.e.def.id === e.def.id);
      const spread = sp?.s ? makeSpreadInfo(sp.s, sp.r, sp.gap) : null;
      if (show === 'spread') {
        return {
          ...base,
          ...look,
          kind: 'pct',
          stat: sp?.r ?? null,
          change: changeOf(sp?.r ?? null, 'pct'),
          comparable: spread?.last ?? null,
          spread,
        };
      }
      const s = price?.s ?? null;
      return {
        ...base,
        ...look,
        kind: 'rupiah',
        stat: s,
        change: changeOf(s, 'rupiah'),
        comparable: price?.perGram ?? null,
        spread,
      };
    });
  }, [manual, stats, entries, spreadStats, show]);

  const sourcePopover = (
    <InfoPopover label="Sumber" ariaLabel="Sumber data" side="top">
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
  );

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
          advOpen={advOpen}
          onOpenAdvanced={openAdvanced}
        />

        {/* Kepala grafik (D-73): judul ringkas + periode di kiri, rentang di kanan (HP: di bawahnya). */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h2 className="m-0 text-lg leading-snug font-semibold">{title}</h2>
            {/* Di HP popover dijangkarkan ke baris periode (bukan ikon) agar tidak meluber ke kanan. */}
            <div className="relative flex min-w-0 items-center gap-1.5">
              <p className="num m-0 text-sm text-muted">
                {formatPeriod(eff.from, eff.to)}
                {view.agg !== 'd' ? ` · penutupan ${AGG_NOUN[view.agg]}` : ''}
              </p>
              <InfoPopover ariaLabel="Keterangan grafik" className="max-sm:static">
                <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                  <li>
                    Ctrl (⌘ di Mac) + gulir atau cubit untuk memperbesar, seret untuk menggeser.
                  </li>
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
                  <li>
                    Akhir pekan dan hari libur saat sumber tidak terbit tidak dianggap kosong.
                  </li>
                  <li>Emas fisik: harga per keping. Tabungan Emas: harga per gram.</li>
                  {!manual && showsSpread(show) ? (
                    <li>
                      Spread = (harga jual − buyback) ÷ harga jual, dari sumber yang sama pada
                      tanggal yang sama. Buyback Logam Mulia selain 1 g dihitung dari buyback 1 g ×
                      berat.
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
          </div>
          <RangeControl
            parts="presets"
            fill
            size="sm"
            value={range}
            onChange={(r) => setRange(r)}
            lastDate={lastDate}
            minDate={minDate ?? undefined}
            className="max-sm:w-full"
          />
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
      </div>

      {hasLines && !error ? (
        <ExplorerSummary
          key={summaryMode}
          items={summaryItems}
          mode={summaryMode}
          valueMode={view.mode}
          to={eff.to}
          loading={loading || !built}
          footer={sourcePopover}
        />
      ) : null}

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
