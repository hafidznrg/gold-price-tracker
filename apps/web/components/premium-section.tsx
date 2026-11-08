'use client';

import { useEffect, useMemo, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { SourceStamp } from '@/components/source-stamp';
import { fetchPremiumAntam, type PremiumAntamFile } from '@/lib/data';
import { premiumStats } from '@/lib/bandingkan';
import { formatDate, formatPct } from '@/lib/format';

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

  const stats = useMemo(() => (file ? premiumStats(file.rows) : null), [file]);
  const series: TimeSeries[] = useMemo(() => {
    if (!file || !stats) return [];
    return [
      {
        id: 'premi',
        label: 'Premi Antam 1 g vs spot',
        color: 'gold',
        area: true,
        points: file.rows.map((r) => [r[0], r[1]]),
      },
      {
        id: 'premi-avg',
        label: `Rata-rata sejak ${formatDate(stats.firstDate)}`,
        color: 'muted',
        dashed: true,
        width: 1.2,
        points: [
          [stats.firstDate, stats.avgPct],
          [stats.last.date, stats.avgPct],
        ],
      },
    ];
  }, [file, stats]);

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
              Premi = harga Antam 1 g ÷ (XAU/USD × USD/IDR ÷ 31,1035) − 1. Memakai spot penutupan
              hari sebelumnya, karena Antam menetapkan harga pagi berdasarkan penutupan itu.
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
            <TimeSeriesChart
              series={series}
              valueFormat="percent"
              height={320}
              showZoom
              ariaLabel="Premi Antam 1 gram terhadap harga emas dunia dari waktu ke waktu"
            />
            <SourceStamp source="logammulia" date={stats.last.date} className="mt-3">
              Antam 1 g · spot penutupan {formatDate(stats.last.spotDate)} · riwayat tersedia sejak{' '}
              {formatDate(stats.firstDate)} · terendah {formatPct(stats.min.pct, 1, false)} (
              {formatDate(stats.min.date)}), tertinggi {formatPct(stats.max.pct, 1, false)} (
              {formatDate(stats.max.date)})
            </SourceStamp>
          </>
        )}

        <div
          role="note"
          className="mt-5 rounded-[14px] border border-goldline bg-goldsoft p-4 text-[13px] leading-[1.6] text-text"
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
              <div className="mt-1.5 text-[12.5px] leading-[1.55] text-muted">{e.body}</div>
            </div>
          ))}
          <div className="rounded-[14px] bg-surface2 p-4">
            <div className="text-sm font-semibold">Estimasi, bukan valuasi</div>
            <div className="mt-1.5 text-[12.5px] leading-[1.55] text-muted">
              Spot xaus bersifat indikatif (futures COMEX GC=F); premi dipakai untuk melihat tren.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
