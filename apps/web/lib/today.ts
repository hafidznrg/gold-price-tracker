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
  /** Deskripsi singkat di bawah judul (hanya kartu lebar Tabungan Emas); null = tanpa. */
  description: string | null;
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
    return `Buyback untuk keping tahun produksi ${h.variant || '—'}${pg('ubs') ? ` ·${pg('ubs')}` : ''}`;
  if (h.source === 'galeri24') {
    const p = pg(h.brand);
    const official =
      h.brand === 'lotusarchi'
        ? all.find((o) => o.source === 'lotusarchi' && o.product === h.product)
        : undefined;
    const la = official?.sell != null ? ` Di lotusarchi.com: ${formatRupiah(official.sell)}.` : '';
    return `Harga dan buyback dari situs Galeri24.${p ? `${p} (tanpa buyback).` : ''}${la}`;
  }
  return 'Pegadaian tidak menampilkan harga buyback untuk emas batangan.';
}

const TABUNGAN_DESC =
  'Produk lain dari emas batangan: saldo emas di Pegadaian, dibeli dan dijual per gram (mulai 0,01 g).';

/**
 * File yang tampil sebagai kartu Hari ini, urut mockup. Harga batangan Pegadaian
 * (`pegadaian-*`) dan seri Galeri24 untuk Antam/UBS (`galeri24-antam`, `galeri24-ubs`) tidak jadi
 * kartu; harga Pegadaian disebut di catatan kartu, Antam/UBS Galeri24 muncul di Spread/Bandingkan.
 */
export const CARD_FILES: readonly string[] = [
  'logammulia-antam',
  'ubslifestyle-ubs',
  'galeri24-galeri24',
  'galeri24-lotusarchi',
  'pegadaian-pegadaian',
];

function sparkOf(s: Spark): { sell: (number | null)[]; buy: (number | null)[] | null } {
  return { sell: s.sell, buy: s.buyback };
}

export function buildCards(latest: LatestFile): CardModel[] {
  return [...latest.highlights]
    .sort((a, b) => compareFileIds(a.file, b.file))
    .filter((h) => CARD_FILES.includes(h.file))
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
        description: h.product === 'gold_savings' ? TABUNGAN_DESC : null,
        noBuyback: 'Tidak ditampilkan sumber',
      };
    });
}
