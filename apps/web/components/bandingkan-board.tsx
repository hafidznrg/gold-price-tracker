'use client';

import { debounce, parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { PremiumSection } from '@/components/premium-section';
import { RangeControl, type RangeValue } from '@/components/range-control';
import { Segmented } from '@/components/segmented';
import { InfoHeading, InfoPopover, InfoRows } from '@/components/info-popover';
import { useSeriesFiles } from '@/components/use-series-files';
import {
  COMPARE_DEFS,
  compareLine,
  decodeCompareMode,
  decodeWeight,
  encodeCompareMode,
  encodeWeight,
  findOption,
  todayRows,
  type CompareMode,
  type TodayCells,
} from '@/lib/bandingkan';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import { COLOR_CLASSES, weightKey } from '@/lib/data';
import {
  DEFAULT_RANGE,
  decodeRange,
  encodeRange,
  mergeGaps,
  type ExplorerOption,
} from '@/lib/explorer';
import { EMPTY, formatDate, formatPct, formatRupiah, formatWeight } from '@/lib/format';
import { rangeToDates } from '@/lib/range';
import { sourceStampParts } from '@/lib/source-stamp';
import { cn } from '@/lib/utils';
import { useChartHeight } from '@/components/use-chart-height';

export interface BandingkanBoardProps {
  /** Opsi katalog hanya untuk enam series yang dibandingkan. */
  options: ExplorerOption[];
  /** Gramasi yang bisa dipilih (dijual sedikitnya dua series). */
  weights: number[];
  today: TodayCells;
  /** Tanggal data terbaru (patokan rentang). */
  asOf: string;
  calendar: DataCalendar;
}

const PANEL = 'min-w-0 rounded-card border border-line bg-surface p-4 sm:px-5';
const COLS = 'grid grid-cols-[minmax(200px,1.6fr)_repeat(5,minmax(110px,1fr))] items-center px-6';

const MODES: { value: 'gram' | 'idx'; label: string }[] = [
  { value: 'gram', label: 'Per gram' },
  { value: 'idx', label: 'Indeks' },
];

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-10 text-center text-sm text-muted">{children}</p>;
}

export function BandingkanBoard({ options, weights, today, asOf, calendar }: BandingkanBoardProps) {
  const [query, setQuery] = useQueryStates(
    { w: parseAsString, m: parseAsString, r: parseAsString },
    { history: 'replace' },
  );
  const w = useMemo(() => decodeWeight(query.w, weights), [query.w, weights]);
  const mode: CompareMode = decodeCompareMode(query.m);
  const range = useMemo(() => decodeRange(query.r), [query.r]);

  const setWeight = useCallback(
    (next: number) => void setQuery({ w: encodeWeight(next) }),
    [setQuery],
  );
  const setMode = useCallback(
    (next: CompareMode) => void setQuery({ m: encodeCompareMode(next) }),
    [setQuery],
  );
  const setRange = useCallback(
    (r: RangeValue) => {
      const code = encodeRange(r);
      void setQuery(
        { r: code === encodeRange(DEFAULT_RANGE) ? null : code },
        typeof r === 'string' ? undefined : { limitUrlUpdates: debounce(300) },
      );
    },
    [setQuery],
  );

  // --- Series yang tersedia pada berat terpilih -----------------------------
  const matched = useMemo(
    () => COMPARE_DEFS.map((d) => ({ d, o: findOption(d, w, options) })),
    [w, options],
  );
  const active = useMemo(() => matched.flatMap(({ d, o }) => (o ? [{ d, o }] : [])), [matched]);
  const needed = useMemo(() => [...new Set(active.map((a) => a.o.file))], [active]);
  const { files, loading, error } = useSeriesFiles(needed);

  const minDate = useMemo(
    () =>
      active
        .map((a) => a.o.first.sell)
        .filter((x): x is string => x !== null)
        .sort()[0],
    [active],
  );
  const { from, to } = rangeToDates(range, asOf);

  const lines = useMemo(
    () =>
      loading
        ? null
        : active.map(({ d, o }) => {
            const f = files[o.file];
            return {
              d,
              line: f ? compareLine(o, f, mode, from, to, expectedFor(calendar, [d.source])) : null,
            };
          }),
    [active, files, loading, mode, from, to, calendar],
  );

  const series: TimeSeries[] = useMemo(
    () =>
      (lines ?? []).flatMap(({ d, line }) =>
        line && line.first
          ? [
              {
                id: d.id,
                label: d.label,
                color: d.color,
                dashed: d.dashed,
                width: d.dashed ? 1.8 : 2.2,
                points: line.points,
              },
            ]
          : [],
      ),
    [lines],
  );
  const gaps = useMemo(
    () => labelGaps(mergeGaps((lines ?? []).map((l) => l.line?.gaps ?? []))),
    [lines],
  );
  const empty = useMemo(
    () => [
      ...matched.filter((m) => !m.o).map((m) => m.d.label),
      ...(lines ?? []).filter((l) => !l.line?.first).map((l) => l.d.label),
    ],
    [matched, lines],
  );
  const shownFrom = useMemo(
    () =>
      (lines ?? [])
        .map((l) => l.line?.first ?? '')
        .filter(Boolean)
        .sort()[0],
    [lines],
  );

  const rows = useMemo(() => todayRows(today, w), [today, w]);
  const stamps = useMemo(() => {
    const by = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const cur = by.get(r.def.source);
      if (!cur || r.date > cur.date) by.set(r.def.source, r);
    }
    return [...by.values()];
  }, [rows]);

  const wText = formatWeight(w);
  const chartTitle =
    mode === 'index'
      ? `Indeks harga jual (=100 di awal rentang) · ${wText}`
      : `Harga jual per gram · ${wText} (keping fisik atau saldo tabungan)`;

  const chartHeight = useChartHeight(320, 240);
  return (
    <>
      <section className="wrap flex flex-wrap items-center gap-x-4 gap-y-2.5 pb-3.5">
        <div className="flex max-w-full min-w-0 items-center gap-2">
          <Segmented
            size="sm"
            scroll
            className="min-w-0"
            label="Gramasi"
            options={weights.map((x) => ({ value: weightKey(x), label: formatWeight(x) }))}
            value={weightKey(w)}
            onChange={(v) => setWeight(Number(v))}
          />
          <Segmented
            size="sm"
            label="Mode nilai"
            options={MODES}
            value={mode === 'index' ? 'idx' : 'gram'}
            onChange={(v) => setMode(v === 'idx' ? 'index' : 'gram')}
            className="flex-none"
          />
        </div>
        <RangeControl
          size="sm"
          value={range}
          onChange={setRange}
          lastDate={asOf}
          minDate={minDate}
        />
      </section>

      <section className="wrap pb-[22px]">
        <div className={PANEL}>
          <h2 className="m-0 text-xl font-semibold max-sm:text-lg">{chartTitle}</h2>
          <p className="num m-0 mt-1 mb-2.5 text-sm text-muted">
            {shownFrom ? `${formatDate(shownFrom)} – ${formatDate(to)}` : formatDate(to)} · garis
            putus-putus = harga di Pegadaian
          </p>
          {error ? (
            <Hint>Data gagal dimuat. Muat ulang halaman.</Hint>
          ) : loading || !lines ? (
            <Hint>Memuat data…</Hint>
          ) : series.length === 0 ? (
            <Hint>Tidak ada data pada gramasi dan rentang ini.</Hint>
          ) : (
            <TimeSeriesChart
              series={series}
              valueFormat={mode === 'index' ? 'number' : 'rupiah'}
              gaps={gaps}
              height={chartHeight}
              ariaLabel={`Perbandingan harga jual ${wText} Antam, UBS, Galeri24, dan Tabungan Emas`}
            />
          )}
          {!loading && lines && empty.length > 0 ? (
            <p className="m-0 mt-3 text-xs text-faint" role="note">
              Tidak ada data untuk {wText} pada rentang ini: {empty.join(', ')}. Seri yang mulai
              belakangan digambar dari tanggal pertamanya.
            </p>
          ) : null}
          {mode === 'index' ? (
            <p className="m-0 mt-2 text-xs text-faint">
              Indeks tiap seri dihitung dari titik pertamanya di rentang, jadi hanya membandingkan
              laju perubahan, bukan tingkat harga.
            </p>
          ) : null}
        </div>
      </section>

      <section className="wrap pb-[26px]">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex flex-wrap items-end justify-between gap-2.5 px-6 pt-[22px] pb-3.5 max-sm:px-4">
            <h2 className="serif m-0 text-[30px]">Hari ini · {wText}</h2>
            <span className="text-xs text-muted">Diurutkan dari harga per gram termurah</span>
          </div>
          <div className="overflow-x-auto">
            <div role="table" aria-label="Perbandingan hari ini" className="min-w-[880px]">
              <div
                role="row"
                className={cn(
                  COLS,
                  'border-t border-line py-[11px] text-2xs font-semibold tracking-[.1em] text-faint uppercase',
                )}
              >
                <span role="columnheader">Brand · sumber</span>
                <span role="columnheader">Harga jual</span>
                <span role="columnheader">Per gram</span>
                <span role="columnheader">Buyback</span>
                <span role="columnheader">Spread</span>
                <span role="columnheader">vs termurah</span>
              </div>
              {rows.length === 0 ? (
                <div role="row" className="border-t border-line px-6 py-6 text-sm text-muted">
                  <span role="cell">Belum ada harga hari ini untuk {wText}.</span>
                </div>
              ) : (
                rows.map((r) => {
                  const has = r.buyback !== null;
                  return (
                    <div
                      key={r.def.id}
                      role="row"
                      className={cn(COLS, 'border-t border-line py-3.5 text-sm')}
                    >
                      <span role="cell" className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'size-[9px] flex-none rounded-[2px]',
                            COLOR_CLASSES[r.def.color].bg,
                          )}
                        />
                        <span>
                          <span className="font-semibold">{r.def.brandName}</span>{' '}
                          <span className="text-muted">· {r.def.sourceName}</span>
                        </span>
                      </span>
                      <span role="cell" className="num font-medium">
                        {formatRupiah(r.sell)}
                      </span>
                      <span role="cell" className="num text-muted">
                        {formatRupiah(r.perGram)}
                      </span>
                      <span role="cell" className={cn('num', has ? 'text-text' : 'text-faint')}>
                        {has ? formatRupiah(r.buyback) : EMPTY}
                      </span>
                      <span role="cell" className={cn('num', has ? 'text-text' : 'text-faint')}>
                        {has ? formatPct(r.spreadPct, 2, false) : EMPTY}
                      </span>
                      <span
                        role="cell"
                        className={cn('num font-semibold', r.cheapest ? 'text-gold' : 'text-muted')}
                      >
                        {r.cheapest ? 'Termurah' : formatPct(r.diffPct, 2)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="border-t border-line px-6 py-3.5 max-sm:px-4">
            <InfoPopover label="Sumber & catatan" ariaLabel="Sumber & catatan" side="top">
              <InfoHeading>Catatan</InfoHeading>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-text marker:text-faint">
                <li>
                  Tabungan emas tidak berbentuk keping: harganya naik lurus mengikuti berat (dicatat
                  sumber per 0,01 g). Mencetaknya jadi emas fisik dikenai biaya cetak terpisah.
                </li>
                <li>Harga Logam Mulia adalah Harga Dasar, belum termasuk PPh 0,25%.</li>
                <li>Buyback Logam Mulia hanya tersedia untuk 1 g.</li>
              </ul>
              <InfoHeading className="mt-2 border-t border-line pt-2.5">Sumber</InfoHeading>
              <InfoRows
                rows={stamps.map((r) => {
                  const p = sourceStampParts(r.def.source, r.date, r.at);
                  return [p.domain, p.when] as const;
                })}
              />
            </InfoPopover>
          </div>
        </div>
      </section>

      <PremiumSection />
    </>
  );
}
