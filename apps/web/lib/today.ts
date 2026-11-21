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
import { changeBasisLabel, formatDate, formatRupiah, formatStampShort } from '@/lib/format';

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
  /** Pembanding perubahan ("vs kemarin" / "vs Jum, 13 Nov"); null bila tanpa pembanding. */
  changeLabel: string | null;
  /** Harga masih carry-over (belum ada harga baru untuk `date`). */
  carryOver: boolean;
  /** "17 Nov 18.20" (jam sumber); null bila tanpa jam. */
  carrySince: string | null;
  /** "data 14 Nov" bila `date` lebih lama dari tanggal data terbaru semua sumber; selain itu null. */
  staleLabel: string | null;
  spread: number | null;
  spreadPct: number | null;
  sellSpark: (number | null)[];
  buySpark: (number | null)[] | null;
  /** Keterangan kaki kartu. */
  note: string;
  /** Baris tambahan kecil di kaki kartu (EMASKU: harga Prime 25 g); null = tanpa. Bukan kartu sendiri. */
  extra: string | null;
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
    return `${TABUNGAN_DESC} Dicatat per 0,01 g: jual ${d(h.sell)} · buyback ${d(h.buyback)}`;
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
  if (h.source === 'hrtagold')
    return 'Harga jual dan buyback keping 1 g dari situs EMASKU (Hartadinata). Harga sudah termasuk pajak menurut Syarat & Ketentuan situs. Seri Prime (25/50/100 g) terpisah dari Gold.';
  return 'Pegadaian tidak menampilkan harga buyback untuk emas batangan.';
}

/** Prime 25 g untuk catatan kartu EMASKU; null bila seri Prime belum ada/tidak berjalan. */
function primeExtra(h: Highlight, latest: LatestFile): string | null {
  if (h.source !== 'hrtagold') return null;
  const p = latest.series.find(
    (s) => s.file === h.file && s.variant === 'prime' && s.w === 25 && s.current,
  );
  return p?.sell != null ? `Prime 25 g: ${formatRupiah(p.sell)}` : null;
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
  'hrtagold-emasku',
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
        changeLabel: h.prev ? changeBasisLabel(h.date, h.prev.date) : null,
        carryOver: h.carry_over,
        carrySince: h.source_updated_at ? formatStampShort(h.source_updated_at) : null,
        staleLabel:
          latest.as_of !== null && h.date < latest.as_of
            ? `data ${formatDate(h.date, false)}`
            : null,
        spread: h.spread,
        spreadPct: h.spread_pct,
        sellSpark: sp.sell,
        buySpark: h.buyback === null ? null : sp.buy,
        note: cardNote(h, latest.highlights),
        extra: primeExtra(h, latest),
        noBuyback: 'Tidak ditampilkan sumber',
      };
    });
}
