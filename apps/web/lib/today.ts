import type { PriceSource } from '@gold/schema';
import {
  colorToken,
  compareFileIds,
  displayBrand,
  perGramPrice,
  seriesFileId,
  seriesGroupLabel,
  unitLabel,
  type Change,
  type ColorToken,
  type Highlight,
  type LatestFile,
  type MetaCatalogGroup,
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

export interface RowModel {
  w: number;
  sell: number | null;
  perGram: number | null;
  buyback: number | null;
  spreadPct: number | null;
  change: Change | null;
  spark: (number | null)[];
}

export interface GroupModel {
  id: string;
  kind: ProductKind;
  brand: string;
  source: PriceSource;
  sourceLabel: string;
  color: ColorToken;
  date: string;
  at: string | null;
  note: string;
  /** Tahun produksi yang tersedia (kosong = tanpa pemilih). */
  variants: string[];
  /** Baris per varian (kunci `''` bila tanpa varian). */
  rows: Record<string, RowModel[]>;
  count: number;
}

/** Berat yang ditampilkan untuk Tabungan Emas (linear, D-34); katalog hanya mencatat 0,01 g. */
export const SAVINGS_WEIGHTS = [0.01, 0.1, 0.5, 1, 5, 10, 25, 50, 100] as const;

const PG_NOTE =
  'Pegadaian tidak menampilkan buyback untuk brand ini, jadi kolom buyback dan spread dibiarkan kosong (D-07).';

function groupNote(h: { source: PriceSource; brand: string; product: string }): string {
  if (h.product === 'gold_savings')
    return 'Tabungan emas tidak berbentuk keping: harga linear terhadap berat, dicatat sumber per 0,01 g. Bisa dicetak menjadi emas fisik dengan biaya cetak terpisah.';
  if (h.source === 'logammulia')
    return 'Harga jual Logam Mulia = Harga Dasar, belum termasuk PPh 0,25%. Buyback hanya tersedia untuk 1 g.';
  if (h.source === 'pegadaian') return PG_NOTE;
  return '';
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

export function buildGroups(latest: LatestFile, catalog: MetaCatalogGroup[]): GroupModel[] {
  const out: GroupModel[] = [];
  for (const cat of catalog) {
    const id = seriesFileId(cat);
    const all = latest.series.filter((s) => s.file === id && s.product === cat.product);
    const hl = latest.highlights.find((h) => h.file === id);
    if (!hl) continue;
    const base = {
      id,
      kind: cat.kind,
      brand: displayBrand(cat),
      source: cat.source,
      sourceLabel: seriesGroupLabel(cat).split(' · ')[1] ?? '',
      color: colorToken(cat),
      date: hl.date,
      at: hl.source_updated_at,
      note: groupNote(cat),
    };

    if (cat.product === 'gold_savings') {
      const rows: RowModel[] = SAVINGS_WEIGHTS.map((w) => ({
        w,
        sell: hl.sell === null ? null : Math.round(hl.sell * w),
        perGram: hl.sell,
        buyback: hl.buyback === null ? null : Math.round(hl.buyback * w),
        spreadPct: hl.spread_pct,
        change: hl.change.sell
          ? { abs: Math.round(hl.change.sell.abs * w), pct: hl.change.sell.pct }
          : null,
        spark: hl.spark.sell,
      }));
      out.push({ ...base, variants: [], rows: { '': rows }, count: rows.length });
      continue;
    }

    const current = all.filter((s) => s.current);
    const variants = [...new Set(current.map((s) => s.variant).filter((v) => v !== ''))]
      .sort()
      .reverse();
    const keys = variants.length > 0 ? variants : [''];
    const rows: Record<string, RowModel[]> = {};
    for (const v of keys) {
      rows[v] = cat.weights.flatMap((w) => {
        const s = current.find((x) => x.w === w && x.variant === v);
        if (!s) return [];
        return [
          {
            w,
            sell: s.sell,
            perGram: perGramPrice(s.sell, w),
            buyback: s.buyback,
            spreadPct: s.spread_pct,
            change: s.change.sell,
            spark: s.spark.sell,
          },
        ];
      });
    }
    // Satu varian saja = tanpa pemilih; baris harus berkunci '' agar cocok dengan `variants: []`.
    const multi = variants.length > 1;
    const outRows = multi ? rows : { '': rows[keys[0] ?? ''] ?? [] };
    out.push({
      ...base,
      variants: multi ? variants : [],
      rows: outRows,
      count: outRows[multi ? (keys[0] ?? '') : '']?.length ?? 0,
    });
  }
  return out.sort((a, b) => compareFileIds(a.id, b.id));
}
