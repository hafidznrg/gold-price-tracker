'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { Segmented } from '@/components/segmented';
import { useSeriesFiles } from '@/components/use-series-files';
import { compareLine, findOption } from '@/lib/bandingkan';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import { COLOR_CLASSES } from '@/lib/data';
import { mergeGaps, type ExplorerOption } from '@/lib/explorer';
import { EMPTY, formatPct, formatRupiah } from '@/lib/format';
import {
  TREND_DEFS,
  TREND_PERIODS,
  trendFrom,
  trendStats,
  type TrendPeriod,
} from '@/lib/home-matrix';
import { cn } from '@/lib/utils';

export interface HomeTrendProps {
  /** Opsi katalog untuk keempat series (1 g dan Tabungan Emas). */
  options: ExplorerOption[];
  asOf: string;
  calendar: DataCalendar;
}

export function HomeTrend({ options, asOf, calendar }: HomeTrendProps) {
  const [period, setPeriod] = useState<TrendPeriod>('30');
  const days = TREND_PERIODS.find((p) => p.value === period)?.days ?? 30;
  const from = trendFrom(asOf, days);

  const active = useMemo(
    () =>
      TREND_DEFS.flatMap((d) =>
        findOption(d, 1, options) ? [{ d, o: findOption(d, 1, options)! }] : [],
      ),
    [options],
  );
  const needed = useMemo(() => [...new Set(active.map((a) => a.o.file))], [active]);
  const { files, loading, error } = useSeriesFiles(needed);

  const lines = useMemo(
    () =>
      loading
        ? null
        : active.map(({ d, o }) => {
            const f = files[o.file];
            return {
              d,
              line: f
                ? compareLine(o, f, 'gram', from, asOf, expectedFor(calendar, [d.source]))
                : null,
            };
          }),
    [active, files, loading, from, asOf, calendar],
  );

  const series: TimeSeries[] = useMemo(
    () =>
      (lines ?? []).flatMap(({ d, line }) =>
        line && line.first
          ? [{ id: d.id, label: d.brandName, color: d.color, width: 2.2, points: line.points }]
          : [],
      ),
    [lines],
  );
  const gaps = useMemo(
    () => labelGaps(mergeGaps((lines ?? []).map((l) => l.line?.gaps ?? []))),
    [lines],
  );

  return (
    <section className="wrap py-6">
      <div className="flex flex-col gap-[18px] rounded-card border border-line bg-surface p-6 max-sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3.5">
          <div>
            <h2 className="serif m-0 text-[32px]">Tren harga jual 1 gram</h2>
            <p className="m-0 mt-1.5 text-sm text-muted">Tabungan Emas dihitung per gram.</p>
          </div>
          <Segmented
            label="Periode"
            options={TREND_PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            value={period}
            onChange={setPeriod}
          />
        </div>

        {error ? (
          <p className="m-0 py-10 text-center text-sm text-muted">
            Data gagal dimuat. Muat ulang halaman.
          </p>
        ) : loading || !lines ? (
          <p className="m-0 py-10 text-center text-sm text-muted">Memuat data…</p>
        ) : series.length === 0 ? (
          <p className="m-0 py-10 text-center text-sm text-muted">
            Tidak ada data pada periode ini.
          </p>
        ) : (
          <TimeSeriesChart
            series={series}
            valueFormat="rupiah"
            gaps={gaps}
            height={280}
            legend={false}
            ariaLabel={`Grafik harga jual 1 gram, ${days} hari terakhir, untuk Antam, UBS, Galeri24, dan Tabungan Emas`}
          />
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
          {TREND_DEFS.map((d) => {
            const line = lines?.find((l) => l.d.id === d.id)?.line;
            const s = line ? trendStats(line.points) : null;
            const chg = s?.changePct ?? null;
            return (
              <div
                key={d.id}
                data-testid="trend-stat"
                className="flex flex-col gap-2 rounded-xl border border-line px-3.5 py-3"
              >
                <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <span
                    aria-hidden="true"
                    className={cn('size-2 rounded-[2px]', COLOR_CLASSES[d.color].bg)}
                  />
                  {d.brandName}
                  <span
                    className={cn(
                      'num ml-auto font-semibold',
                      chg === null ? 'text-muted' : chg >= 0 ? 'text-up' : 'text-down',
                    )}
                  >
                    {chg === null ? EMPTY : formatPct(chg, 1)}
                  </span>
                </span>
                <div className="num grid grid-cols-3 gap-1.5 text-[12.5px]">
                  {[
                    ['Tertinggi', s?.hi],
                    ['Terendah', s?.lo],
                    ['Rata-rata', s?.avg],
                  ].map(([label, v]) => (
                    <span key={label as string} className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-faint">{label}</span>
                      <span>{typeof v === 'number' ? formatRupiah(v) : EMPTY}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end text-[13px]">
          <Link href="/explorer" className="font-semibold text-gold no-underline hover:text-text">
            Buka riwayat lengkap sejak 2010 →
          </Link>
        </div>
      </div>
    </section>
  );
}
