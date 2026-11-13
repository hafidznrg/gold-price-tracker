'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { PageIntro } from '@/components/page-intro';
import { Segmented } from '@/components/segmented';
import { SourceStamp } from '@/components/source-stamp';
import type { AnnualRow, LatestSpot } from '@/lib/data';
import {
  AGGREGATIONS,
  BASE_YEARS,
  buildModel,
  decodeAggregation,
  decodeBaseYear,
  DEFAULT_AGGREGATION,
  DEFAULT_BASE_YEAR,
  LM_FIRST_YEAR,
  logAxis,
  sourceLabel,
  type Aggregation,
  type ConceptId,
  type KLine,
} from '@/lib/kelipatan';
import {
  EMPTY,
  formatDate,
  formatMultiple,
  formatNumber,
  formatPct,
  formatRupiah,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useChartHeight } from '@/components/use-chart-height';

export interface KelipatanBoardProps {
  annual: AnnualRow[];
  /** Tanggal data harian terakhir (`annual.json#until`): tahun berjalan dirata-ratakan sampai sini. */
  until: string | null;
  spot: LatestSpot | null;
  events: { date: string; label: string }[];
}

const PANEL = 'min-w-0 rounded-card border border-line bg-surface p-4 sm:px-5';
const COLS =
  'grid grid-cols-[72px_minmax(100px,.9fr)_minmax(150px,1.1fr)_minmax(100px,.9fr)_minmax(150px,1.1fr)_minmax(120px,1fr)_90px] items-center gap-x-3 px-6';

/** Seri bukan brand (D-52): `spot` solid, `spot` putus-putus, lalu `muted` solid. */
const CONCEPTS: {
  id: Exclude<ConceptId, 'lm'>;
  name: string;
  color: string;
  dashed: boolean;
}[] = [
  { id: 'idr', name: 'Emas Rp/gram', color: 'spot', dashed: false },
  { id: 'usd', name: 'Emas US$/oz', color: 'spot', dashed: true },
  { id: 'fx', name: 'USD/IDR', color: 'muted', dashed: false },
];

function cagrText(line: KLine | null): string {
  return line?.cagr === null || line?.cagr === undefined ? EMPTY : formatPct(line.cagr * 100, 1);
}

export function KelipatanBoard({ annual, until, spot, events }: KelipatanBoardProps) {
  const [query, setQuery] = useQueryStates(
    { b: parseAsString, a: parseAsString, lm: parseAsString },
    { history: 'replace' },
  );
  const base = decodeBaseYear(query.b);
  const agg: Aggregation = decodeAggregation(query.a);
  const showLm = query.lm === '1';

  const setBase = useCallback(
    (y: number) => void setQuery({ b: y === DEFAULT_BASE_YEAR ? null : String(y) }),
    [setQuery],
  );
  const setAgg = useCallback(
    (a: Aggregation) => void setQuery({ a: a === DEFAULT_AGGREGATION ? null : a }),
    [setQuery],
  );
  const setLm = useCallback((on: boolean) => void setQuery({ lm: on ? '1' : null }), [setQuery]);

  const chartHeight = useChartHeight(330, 250);

  const model = useMemo(
    () => buildModel(annual, until, spot, base, agg),
    [annual, until, spot, base, agg],
  );
  const { lines } = model;
  const spotPt = model.spot;
  const lm = showLm ? lines.lm : null;

  const chart = useMemo(() => {
    const series: TimeSeries[] = [];
    if (lm) {
      series.push({
        id: 'k-lm',
        label: 'Antam LM 1 g',
        legendLabel:
          lm.baseYear === base ? 'Antam LM 1 g (opsional)' : `Antam LM 1 g (=×1 di ${lm.baseYear})`,
        color: 'antam',
        dashed: true,
        width: 2,
        points: lm.points,
      });
    }
    for (const c of [...CONCEPTS].reverse()) {
      const line = lines[c.id];
      if (!line) continue;
      const hasSpot = !!line.spot;
      series.push({
        id: `k-${c.id}`,
        label: c.name,
        color: c.color,
        dashed: c.dashed,
        width: c.id === 'idr' ? 3 : c.dashed ? 1.8 : 2.2,
        ...(hasSpot ? {} : { endLabel: formatMultiple(line.last), endDot: true }),
        points: line.points,
      });
      if (line.spot) {
        const from = line.points.at(-1)!;
        series.push({
          id: `k-${c.id}-spot`,
          label: `${c.name} · spot hari ini`,
          legendLabel: c.id === 'idr' ? 'Ke titik spot hari ini' : undefined,
          ...(c.id === 'idr' ? {} : { legend: false as const }),
          color: c.color,
          dashed: true,
          width: 2,
          endDot: true,
          endLabel: formatMultiple(line.spot[1]),
          tooltipAfter: from[0],
          points: [from, line.spot],
        });
      }
    }
    const values = series.flatMap((s) => s.points.map((p) => p[1] ?? 0));
    const axis = logAxis(values);
    const first = CONCEPTS.map((c) => lines[c.id]?.points[0]?.[0])
      .filter((x): x is string => !!x)
      .sort()[0];
    return { series, axis, first };
  }, [lines, lm, base]);

  const idr = lines.idr;
  const usd = lines.usd;
  const fx = lines.fx;
  const noData = !idr || !usd || !fx;
  const stampDate = model.spot?.date ?? (idr ? idr.points.at(-1)![0] : '');
  const baseRow = model.rows.find((r) => r.year === base);
  // Porsi kenaikan rupiah (skala log) yang berasal dari kurs: ln(×kurs) / ln(×rupiah).
  const fxShare =
    idr?.last && fx?.last && idr.last > 1.05 && fx.last > 1
      ? Math.min(100, Math.round((Math.log(fx.last) / Math.log(idr.last)) * 100))
      : null;
  const lmLastDate = useMemo(() => {
    const r = annual.findLast((a) => a.antam_lm);
    return r?.antam_lm?.end_date ?? null;
  }, [annual]);
  const tableRows = model.rows.filter((r) => r.year >= base);
  const partialYear = model.rows.find((r) => r.partial)?.year;

  return (
    <>
      <PageIntro
        eyebrow="Kelipatan · skala log"
        title={
          noData ? (
            'Berapa kali lipat harga emas naik'
          ) : (
            <>
              Emas naik <em className="num">{formatMultiple(idr.last)}</em> dalam rupiah sejak{' '}
              {base}
            </>
          )
        }
        lead={
          noData
            ? 'Data untuk tahun dasar ini belum lengkap. Pilih tahun dasar lain.'
            : `Dalam dolar ${formatMultiple(usd.last)}, dan dolar terhadap rupiah ${formatMultiple(fx.last)}. Kelipatan rupiah ≈ kelipatan dolar × kelipatan kurs${
                fxShare !== null
                  ? `: kira-kira ${fxShare}% kenaikan harga emas lokal (dalam skala log) datang dari pelemahan rupiah, sisanya dari harga emas dunia.`
                  : '.'
              }`
        }
      />
      {!noData ? (
        <section
          className="wrap flex flex-wrap gap-2 pb-2.5 max-sm:flex-nowrap max-sm:overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Ringkasan kelipatan"
        >
          {CONCEPTS.map((c) => {
            const line = lines[c.id];
            return (
              <span
                key={c.id}
                className="num inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[10px] border border-line bg-surface px-3 py-1.5 text-sm"
              >
                <svg aria-hidden="true" width="18" height="8" className="shrink-0">
                  <line
                    x1="1"
                    y1="4"
                    x2="17"
                    y2="4"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeDasharray={c.dashed ? '5 4' : undefined}
                    style={{ stroke: `var(--${c.color})` }}
                  />
                </svg>
                <span className="text-muted">{c.name}</span>
                <span className="font-semibold">{formatMultiple(line?.last)}</span>
                <span className="text-faint">CAGR {cagrText(line ?? null)}</span>
              </span>
            );
          })}
        </section>
      ) : null}

      <section className="wrap flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 pb-3.5">
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2.5">
          <span className="text-xs text-muted max-sm:hidden">Tahun dasar</span>
          <Segmented
            size="sm"
            scroll
            label="Tahun dasar"
            options={BASE_YEARS.map((y) => ({ value: String(y), label: String(y) }))}
            value={String(base)}
            onChange={(v) => setBase(Number(v))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <Segmented
            size="sm"
            label="Agregasi tahunan"
            options={AGGREGATIONS}
            value={agg}
            onChange={setAgg}
          />
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={showLm}
              onChange={(e) => setLm(e.target.checked)}
              className="m-0 size-[18px] accent-[var(--gold)]"
            />
            Garis Antam LM (sejak {LM_FIRST_YEAR})
          </label>
        </div>
      </section>

      <section className="wrap pb-[22px]">
        <div className={PANEL}>
          <h2 className="m-0 text-xl font-semibold max-sm:text-lg">
            Kelipatan harga emas dan kurs sejak {base}{' '}
            <span className="font-normal text-muted">
              ({agg === 'avg' ? 'rata-rata tahunan' : 'penutupan akhir tahun'})
            </span>
          </h2>
          <p className="m-0 mt-1 mb-2.5 text-sm text-muted">
            Nilai tahun {base} = ×1 · sumbu Y berskala log, jarak yang sama berarti kenaikan persen
            yang sama
          </p>
          {noData ? (
            <p className="m-0 py-10 text-center text-sm text-muted">
              Tidak ada data lengkap untuk tahun dasar {base}.
            </p>
          ) : (
            <TimeSeriesChart
              series={chart.series}
              valueFormat="multiple"
              yLog
              yMin={chart.axis.min}
              yMax={chart.axis.max}
              yTicks={chart.axis.ticks}
              baseline={1}
              events={events}
              gridRight={64}
              height={chartHeight}
              ariaLabel={`Kelipatan harga emas dalam rupiah dan dolar serta kurs USD/IDR sejak ${base}, skala logaritmik`}
            />
          )}
          {!noData ? (
            <div className="mt-3 flex flex-col gap-1.5 text-xs leading-normal text-faint">
              <p className="m-0">
                {agg === 'avg'
                  ? `Titik tiap tahun = rata-rata setahun, digambar di pertengahan tahun${partialYear ? ` (${partialYear} = rata-rata 1 Jan – ${formatDate(until ?? '')})` : ''}.`
                  : `Titik tiap tahun = nilai terakhir hingga 31 Des${partialYear ? ` (${partialYear} = nilai terakhir, ${formatDate(until ?? '')})` : ''}.`}
                {spotPt
                  ? ` Garis putus-putus berujung di titik spot hari ini (${formatDate(spotPt.date)}): XAU/USD ${formatNumber(spotPt.usd, 2)} × kurs ${formatRupiah(spotPt.fx)} ÷ 31,1035 = ${formatRupiah(spotPt.idr)}/gram.`
                  : ''}
              </p>
              <p className="m-0">
                Spot dari xaus.com bersifat indikatif (kontrak berjangka COMEX GC=F, bukan patokan
                LBMA). Kelipatan dihitung terhadap {baseRow ? `nilai ${base}` : 'tahun dasar'} pada
                agregasi yang sama, jadi titik spot hari ini tidak selalu searah dengan garis
                tahunan.
              </p>
              {showLm ? (
                <p className="m-0">
                  Garis Antam LM 1 g (harga jual, bukan spot) mulai {LM_FIRST_YEAR}:{' '}
                  {lm && lm.baseYear !== base
                    ? `diindeks ke tahun pertamanya (${lm.baseYear} = ×1) karena data Antam belum ada pada ${base}, sehingga tidak sejajar dengan garis lain`
                    : `diindeks ke tahun dasar yang sama (${base} = ×1)`}
                  . Selisihnya dengan garis emas Rp/gram mencerminkan premi Antam.
                </p>
              ) : null}
              {showLm && lmLastDate ? (
                <SourceStamp source="logammulia" date={lmLastDate}>
                  Antam LM 1 g, harga jual
                </SourceStamp>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="wrap pb-16">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="px-6 pt-[22px] pb-3.5 max-sm:px-4">
            <h2 className="serif m-0 text-[30px]">Angka di balik garis</h2>
            <p className="m-0 mt-1.5 text-sm text-muted">
              Untuk setiap tahun dipakai data harian bila cakupannya ≥ 80% hari kerja, jika tidak
              rata-rata bulanan, jika tidak nilai tahunan.
              {partialYear ? ` *${partialYear} = sampai ${formatDate(until ?? '')}.` : ''}
              {agg === 'end'
                ? ' Penutupan akhir tahun = titik terakhir hingga 31 Des pada seri yang sama; seri bulanan memakai rata-rata bulan Desember dan seri tahunan tidak punya penutupan.'
                : ''}
            </p>
          </div>
          <div
            className="max-h-[560px] overflow-auto"
            tabIndex={0}
            role="region"
            aria-label={`Tabel ${agg === 'avg' ? 'rata-rata tahunan' : 'penutupan akhir tahun'}`}
          >
            <div
              role="table"
              aria-label={agg === 'avg' ? 'Rata-rata tahunan' : 'Penutupan akhir tahun'}
              className="min-w-[900px]"
            >
              <div
                role="row"
                className={cn(
                  COLS,
                  'sticky top-0 z-10 border-t border-line bg-surface py-[11px] text-2xs font-semibold tracking-[.1em] text-faint uppercase',
                )}
              >
                <span role="columnheader">Tahun</span>
                <span role="columnheader">US$/oz</span>
                <span role="columnheader">Sumber emas</span>
                <span role="columnheader">USD/IDR</span>
                <span role="columnheader">Sumber kurs</span>
                <span role="columnheader">Rp/gram</span>
                <span role="columnheader">Kelipatan</span>
              </div>
              {tableRows.map((r) => (
                <div
                  key={r.year}
                  role="row"
                  className={cn(
                    COLS,
                    'border-t border-line py-3 text-sm',
                    r.year === base && 'bg-goldsoft',
                  )}
                >
                  <span role="cell" className="num font-semibold">
                    {r.year}
                    {r.partial ? '*' : ''}
                  </span>
                  <span role="cell" className="num">
                    {r.usd === null ? EMPTY : `US$${formatNumber(r.usd, 2)}`}
                  </span>
                  <span role="cell" className="text-xs text-muted">
                    {sourceLabel(r.usdSrc, agg)}
                  </span>
                  <span role="cell" className="num">
                    {r.fx === null ? EMPTY : formatRupiah(r.fx)}
                  </span>
                  <span role="cell" className="text-xs text-muted">
                    {sourceLabel(r.fxSrc, agg)}
                  </span>
                  <span role="cell" className="num">
                    {r.idr === null ? EMPTY : formatRupiah(r.idr)}
                  </span>
                  <span role="cell" className="num font-semibold text-gold">
                    {r.idr === null || !baseRow?.idr ? EMPTY : formatMultiple(r.idr / baseRow.idr)}
                  </span>
                </div>
              ))}
              {spotPt && baseRow?.idr ? (
                <div
                  role="row"
                  className={cn(COLS, 'border-t border-line bg-surface2 py-3 text-sm')}
                >
                  <span role="cell" className="num font-semibold">
                    Spot
                  </span>
                  <span role="cell" className="num">
                    US${formatNumber(spotPt.usd, 2)}
                  </span>
                  <span role="cell" className="text-xs text-muted">
                    xaus · indikatif, {formatDate(spotPt.date)}
                  </span>
                  <span role="cell" className="num">
                    {formatRupiah(spotPt.fx)}
                  </span>
                  <span role="cell" className="text-xs text-muted">
                    JISDOR · harian
                  </span>
                  <span role="cell" className="num">
                    {formatRupiah(spotPt.idr)}
                  </span>
                  <span role="cell" className="num font-semibold text-gold">
                    {formatMultiple(spotPt.idr / baseRow.idr)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          {stampDate ? (
            <p className="m-0 border-t border-line px-6 py-3 text-xs text-faint max-sm:px-4">
              Emas dunia: xaus.com (harian sejak 2021), World Bank Pink Sheet (bulanan sebelumnya).
              Kurs: Bank Indonesia JISDOR, ECB via Frankfurter, World Bank WDI (1996–1998, nilai
              tahunan). Rp/gram = US$/oz × kurs ÷ 31,1035.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
