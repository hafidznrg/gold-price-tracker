import type { Metadata } from 'next';
import { PageIntro } from '@/components/page-intro';
import { SpreadBoard, type BarSource } from '@/components/spread-board';
import { readLatest } from '@/lib/data/load-fs';
import {
  buildOptions,
  compareItems,
  compatible,
  todayPair,
  ubsYear,
  weightSpreads,
  type TodayPair,
} from '@/lib/spread';

export const metadata: Metadata = {
  title: 'Spread',
  description:
    'Bandingkan spread (selisih harga jual dan buyback) emas batangan Antam, UBS, dan Pegadaian per gramasi dan dari waktu ke waktu.',
  openGraph: { title: 'Spread' },
};

export default function SpreadPage() {
  const latest = readLatest();
  const { sell, buyback } = buildOptions(latest);
  const year = ubsYear(latest);

  const today: Record<string, TodayPair> = {};
  for (const s of sell) {
    for (const b of buyback) {
      if (compatible(s, b)) today[`${s.id}|${b.id}`] = todayPair(latest, s, b);
    }
  }

  const stampOf = (source: string, variant: string, file: string) => {
    const hit = latest.series.find((r) => r.file === file && r.variant === variant && r.current);
    return {
      source: (hit?.source ?? source) as BarSource['source'],
      date: hit?.date ?? null,
      at: hit?.source_updated_at ?? null,
    };
  };
  const bars: BarSource[] = [
    {
      id: 'ubsl',
      label: 'UBS Lifestyle · UBS',
      note: `UBS Lifestyle · tahun produksi ${year}`,
      rows: weightSpreads(latest, 'ubslifestyle-ubs', year),
      ...stampOf('ubslifestyle', year, 'ubslifestyle-ubs'),
    },
    {
      id: 'lm',
      label: 'Logam Mulia · Antam',
      note: 'Logam Mulia · Antam. Buyback hanya tersedia untuk 1 g',
      rows: weightSpreads(latest, 'logammulia-antam', ''),
      ...stampOf('logammulia', '', 'logammulia-antam'),
    },
  ];

  return (
    <>
      <PageIntro
        eyebrow="Spread"
        title={
          <>
            Jarak antara harga beli <em>dan jual kembali</em>
          </>
        }
        lead="Spread adalah selisih harga jual toko dengan harga buyback. Makin sempit, makin cepat emas yang dibeli kembali ke titik impas."
      />
      <SpreadBoard
        sellOptions={sell}
        buybackOptions={buyback}
        today={today}
        compare={compareItems(latest)}
        bars={bars}
        asOf={latest.as_of ?? new Date().toISOString().slice(0, 10)}
      />
    </>
  );
}
