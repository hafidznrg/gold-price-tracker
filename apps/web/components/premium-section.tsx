'use client';

import { useEffect, useMemo, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { InfoPopover, InfoRows } from '@/components/info-popover';
import { Segmented } from '@/components/segmented';
import { fetchPremiumAntam, type PremiumAntamFile } from '@/lib/data';
import { premiumMonthlyLine, premiumStats } from '@/lib/bandingkan';
import { formatDate, formatMonthYear, formatPct } from '@/lib/format';
import { rangeToDates } from '@/lib/range';
import { sourceStampParts } from '@/lib/source-stamp';

type PremiumView = 'bulanan' | 'harian';

const VIEWS = [
  { value: 'bulanan', label: 'Bulanan' },
  { value: 'harian', label: 'Harian' },
] as const;

const EXPLAIN: { title: string; body: string }[] = [
  {
    title: 'Ongkos cetak & sertifikat',
    body: 'Biaya produksi per keping, terasa lebih besar di pecahan kecil.',
  },
  {
    title: 'Margin distribusi',
    body: 'Selisih yang diambil penerbit dan jaringan penjualnya.',
  },
  {
    title: 'Pajak',
    body: 'Pajak yang melekat pada transaksi emas batangan sesuai ketentuan berlaku. Harga Logam Mulia di sini adalah Harga Dasar, belum termasuk PPh 0,25%.',
  },
];

/**
 * Premi Antam vs spot (P4-09, FR-33): grafik premi % dari `derived/premium-antam.json`, angka
 * hari ini dan rata-rata, penjelasan komponen premi, dan penegasan bahwa spot hanya indikatif.
 */
export function PremiumSection() {
  const [file, setFile] = useState<PremiumAntamFile | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchPremiumAntam().then(
      (f) => alive && setFile(f),
      () => alive && setError(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const [view, setView] = useState<PremiumView>('bulanan');
  const stats = useMemo(() => (file ? premiumStats(file.rows) : null), [file]);
  const line = useMemo(
    () => (file ? premiumMonthlyLine(file.rows, file.monthly ?? []) : []),
    [file],
  );
  // Mode Harian dibuka di 1 tahun terakhir; riwayat sejak 2021 tetap bisa dibuka lewat slider.
  const dailyRange = useMemo(() => {
    if (!stats) return undefined;
    const from = rangeToDates('1T', stats.last.date).from;
    return from
      ? { from: from < stats.firstDate ? stats.firstDate : from, to: stats.last.date }
      : undefined;
  }, [stats]);
  const series: TimeSeries[] = useMemo(() => {
    if (!file || !stats) return [];
    const avg: TimeSeries = {
      id: 'premi-avg',
      label: `Rata-rata harian sejak ${formatDate(stats.firstDate)}`,
      color: 'muted',
      dashed: true,
      width: 1.2,
      // Mode Harian dibuka ter-zoom; dataZoom membuang titik di luar jendela, jadi garis dua titik
      // akan hilang. Satu titik per hari menjaga garis tetap tampil di jendela mana pun.
      points:
        view === 'harian'
          ? file.rows.map((r) => [r[0], stats.avgPct])
          : [
              [stats.firstDate, stats.avgPct],
              [stats.last.date, stats.avgPct],
            ],
    };
    if (view === 'harian') {
      return [
        {
          id: 'premi',
          label: 'Premi harian Antam 1 g',
          color: 'spot',
          area: true,
          points: file.rows.map((r) => [r[0], r[1]]),
        },
        avg,
      ];
    }
    return [
      {
        id: 'premi-bulanan',
        label: 'Premi bulanan Antam 1 g (rata-rata)',
        color: 'spot',
        area: true,
        points: line.map((m) => [`${m.month}-15`, m.pct]),
        notes: Object.fromEntries(
          line.map((m) => [
            `${m.month}-15`,
            m.basis === 'daily'
              ? `rata-rata ${m.days} hari premi harian`
              : `dari harga rata-rata bulanan · ${m.days} hari harga Antam`,
          ]),
        ),
      },
      avg,
    ];
  }, [file, stats, line, view]);

  return (
    <section className="wrap pb-16" aria-labelledby="premi-judul">
      <div className="rounded-card border border-line bg-surface p-[26px] max-sm:p-4">
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[640px] min-w-0">
            <p className="eyebrow m-0 mb-2.5 text-gold">Premi Antam vs spot</p>
            <h2 id="premi-judul" className="serif m-0 text-[38px] leading-[1.1] max-sm:text-[30px]">
              Berapa mahal emas ritel dibanding harga dunia
            </h2>
            <p className="m-0 mt-3 text-sm leading-[1.6] text-muted">
              Premi menunjukkan seberapa mahal emas Antam 1 gram dibanding harga emas dunia. Premi
              10% berarti Antam dijual 10% di atas nilai 1 gram emas di pasar dunia. Harga dunia
              (US$ per troy ons) diubah ke rupiah per gram: dikali kurs USD/IDR, lalu dibagi 31,1035
              (jumlah gram dalam 1 troy ons).
            </p>
            <p className="m-0 mt-2 text-sm leading-[1.6] text-muted">
              Harga dunia yang dipakai adalah penutupan hari sebelumnya, karena harga pagi Antam
              ditetapkan dari penutupan itu. Sebelum November 2021 harga dunia harian belum
              tersedia, jadi premi bulanan masa itu dihitung dari rata-rata bulanan.
            </p>
          </div>
          <div className="flex flex-wrap gap-7">
            <div>
              <div className="text-xs text-faint">Hari ini</div>
              <div className="num mt-1 text-[30px] font-semibold text-gold">
                {stats ? formatPct(stats.last.pct, 1) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-faint">
                Rata-rata{stats ? ` sejak ${stats.firstDate.slice(0, 4)}` : ''}
              </div>
              <div className="num mt-1 text-[30px] font-semibold">
                {stats ? formatPct(stats.avgPct, 1) : '—'}
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <p className="m-0 py-10 text-center text-sm text-muted">
            Data premi gagal dimuat. Muat ulang halaman.
          </p>
        ) : !file ? (
          <p className="m-0 py-10 text-center text-sm text-muted">Memuat data premi…</p>
        ) : !stats ? (
          <p className="m-0 py-10 text-center text-sm text-muted">
            Data premi belum tersedia: butuh harga emas dunia dan kurs harian.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Segmented
                size="sm"
                label="Tampilan premi"
                options={VIEWS}
                value={view}
                onChange={setView}
              />
              <span className="text-xs text-faint">
                {view === 'bulanan'
                  ? `Rata-rata per bulan, ${line[0] ? formatMonthYear(`${line[0].month}-01`) : ''} – kini`
                  : `Per hari, 1 tahun terakhir · geser atau zoom grafik untuk melihat sejak ${formatDate(stats.firstDate)}`}
              </span>
            </div>
            <TimeSeriesChart
              key={view}
              series={series}
              range={view === 'harian' ? dailyRange : undefined}
              valueFormat="percent"
              height={320}
              showZoom
              ariaLabel="Premi Antam 1 gram terhadap harga emas dunia dari waktu ke waktu"
            />
            <InfoPopover label="Sumber" ariaLabel="Sumber data" side="top" className="mt-3">
              <InfoRows
                rows={[
                  [
                    'Sumber',
                    Object.values(sourceStampParts('logammulia', stats.last.date, null)).join(
                      ' · ',
                    ),
                  ],
                  ['Rumus', 'harga Antam 1 g ÷ (XAU/USD × USD/IDR ÷ 31,1035) − 1'],
                  ['Spot', `penutupan ${formatDate(stats.last.spotDate)}`],
                  [
                    'Riwayat',
                    file.monthly?.[0]
                      ? `bulanan ${formatMonthYear(`${file.monthly[0][0]}-01`)} – ${formatMonthYear(`${file.monthly.at(-1)![0]}-01`)}, harian sejak ${formatDate(stats.firstDate)}`
                      : `harian sejak ${formatDate(stats.firstDate)}`,
                  ],
                  [
                    'Terendah',
                    `${formatPct(stats.min.pct, 1, false)} · ${formatDate(stats.min.date)}`,
                  ],
                  [
                    'Tertinggi',
                    `${formatPct(stats.max.pct, 1, false)} · ${formatDate(stats.max.date)}`,
                  ],
                ]}
              />
              <p className="m-0 mt-1 text-[11px] text-faint">
                Terendah dan tertinggi dari premi harian.
              </p>
            </InfoPopover>
          </>
        )}

        <div
          role="note"
          className="mt-5 rounded-[14px] border border-goldline bg-goldsoft p-4 text-sm leading-[1.6] text-text"
        >
          <strong className="font-semibold">
            Spot dunia bersifat indikatif, premi hanya estimasi.
          </strong>{' '}
          Riwayat XAU/USD dari xaus.com berasal dari kontrak berjangka emas COMEX (GC=F), bukan
          harga spot LBMA; selisihnya biasanya di bawah 1%, dan di sini dipakai karena tersedia
          gratis dan harian. Karena itu angka premi dipakai untuk melihat tren dan perbandingan
          antarwaktu, bukan sebagai valuasi atau patokan harga wajar.
        </div>

        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
          {EXPLAIN.map((e) => (
            <div key={e.title} className="rounded-[14px] bg-surface2 p-4">
              <div className="text-sm font-semibold">{e.title}</div>
              <div className="mt-1.5 text-xs leading-[1.55] text-muted">{e.body}</div>
            </div>
          ))}
          <div className="rounded-[14px] bg-surface2 p-4">
            <div className="text-sm font-semibold">Estimasi, bukan valuasi</div>
            <div className="mt-1.5 text-xs leading-[1.55] text-muted">
              Spot xaus bersifat indikatif (futures COMEX GC=F); premi dipakai untuk melihat tren.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
