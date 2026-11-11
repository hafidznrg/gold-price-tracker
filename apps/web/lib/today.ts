import type { PriceSource } from '@gold/schema';
import {
  colorToken,
  compareFileIds,
  displayBrand,
  unitLabel,
  type Change,
  type ColorToken,
  type Highlight,
  type LatestFile,
  type ProductKind,
  type Spark,
} from '@/lib/data';
import { formatRupiah } from '@/lib/format';

// Model tampilan halaman Hari ini: bentuk datar yang aman diserialisasi ke komponen klien.

export interface CardModel {
  id: string;
  kind: ProductKind;
  title: string;
  color: ColorToken;
  source: PriceSource;
  date: string;
  at: string | null;
  unit: string;
  sell: number | null;
  buyback: number | null;
  change: Change | null;
  spread: number | null;
  spreadPct: number | null;
  sellSpark: (number | null)[];
  buySpark: (number | null)[] | null;
  /** Keterangan kaki kartu. */
  note: string;
  noBuyback: string;
}

function cardNote(h: Highlight, all: Highlight[]): string {
  const pg = (brand: string) => {
    const x = all.find(
      (o) => o.source === 'pegadaian' && o.brand === brand && o.product === h.product,
    );
    return x?.sell != null ? ` Di Pegadaian: ${formatRupiah(x.sell)}` : '';
  };
  if (h.product === 'gold_savings') {
    const d = (n: number | null) => (n === null ? 'tidak ditampilkan' : formatRupiah(n / 100, 0));
    return `Dicatat per 0,01 g: jual ${d(h.sell)} · buyback ${d(h.buyback)}`;
  }
  if (h.source === 'logammulia') return `Harga dasar belum termasuk PPh 0,25%.${pg('antam')}`;
  if (h.source === 'ubslifestyle')
    return `Buyback tahun produksi ${h.variant || '—'}${pg('ubs') ? ` ·${pg('ubs')}` : ''}`;
  if (h.brand === 'galeri24')
    return 'Galeri24 hanya dijual lewat Pegadaian. Sumber buyback masih dipelajari (Q-1).';
  return 'Pegadaian tidak menampilkan harga buyback batangan (D-07).';
}

function sparkOf(s: Spark): { sell: (number | null)[]; buy: (number | null)[] | null } {
  return { sell: s.sell, buy: s.buyback };
}

export function buildCards(latest: LatestFile): CardModel[] {
  return [...latest.highlights]
    .sort((a, b) => compareFileIds(a.file, b.file))
    .filter(
      (h) => h.source !== 'pegadaian' || h.product === 'gold_savings' || h.brand === 'galeri24',
    )
    .map((h) => {
      const sp = sparkOf(h.spark);
      return {
        id: h.file,
        kind: h.kind,
        title: displayBrand(h),
        color: colorToken(h),
        source: h.source,
        date: h.date,
        at: h.source_updated_at,
        unit: unitLabel(h),
        sell: h.sell,
        buyback: h.buyback,
        change: h.change.sell,
        spread: h.spread,
        spreadPct: h.spread_pct,
        sellSpark: sp.sell,
        buySpark: h.buyback === null ? null : sp.buy,
        note: cardNote(h, latest.highlights),
        noBuyback: 'Tidak ditampilkan sumber',
      };
    });
}
