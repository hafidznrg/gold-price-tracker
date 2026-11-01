import type {
  Brand,
  EventConfig,
  Frequency,
  MacroSource,
  MacroUnit,
  PriceSource,
  Product,
  RunStatus,
  ScraperId,
  Series,
  SpotSnapshot,
  UpdateCalendar,
} from '@gold/schema';

// Bentuk file di public/data/ (TECH-SPEC §8). Dipakai bersama oleh scripts/build-data.ts
// (penulis) dan UI (pembaca). Semua harga ritel dalam rupiah **apa adanya per `w` gram**:
// Tabungan Emas = harga per 0,01 g (D-30); UI membagi dengan `w` untuk tampilan per gram.

export type PriceField = 'sell' | 'buyback';

/** Jenis produk untuk filter Hari ini: "Emas fisik" / "Tabungan emas". */
export type ProductKind = 'fisik' | 'tabungan';

/** Identitas satu series ritel (tanpa jenis harga). */
export interface SeriesRef {
  source: PriceSource;
  brand: Brand;
  product: Product;
  /** `''` bila tidak ada; tahun produksi `YYYY` untuk UBS Lifestyle. */
  variant: string;
  /** Berat dalam gram (`weight_g`). */
  w: number;
}

export interface PriceSeriesRef extends SeriesRef {
  price: PriceField;
}

// ---------------------------------------------------------------------------
// series/{file}.json

export const SERIES_FIELDS = ['date', 'variant', 'w', 'sell', 'buyback'] as const;

/** `[date, variant, w, sell, buyback]`; harga null bila sumber tidak menampilkan. */
export type SeriesRowTuple = [
  date: string,
  variant: string,
  w: number,
  sell: number | null,
  buyback: number | null,
];

/** `public/data/series/{file}.json` — seri harian satu source × brand × product. */
export interface SeriesFile {
  file: string;
  source: PriceSource;
  brand: Brand;
  product: Product;
  location: string;
  fields: typeof SERIES_FIELDS;
  /** Terurut menurut `date`, lalu `variant`, lalu `w`. */
  rows: SeriesRowTuple[];
}

// ---------------------------------------------------------------------------
// macro/{series}.json

export const MACRO_FIELDS = ['date', 'frequency', 'value', 'source'] as const;
export type MacroRowTuple = [date: string, frequency: Frequency, value: number, source: MacroSource];

/** `public/data/macro/{series}.json` — seri makro mentah semua frekuensi. */
export interface MacroFile {
  series: Series;
  unit: MacroUnit;
  fields: typeof MACRO_FIELDS;
  /** Terurut menurut `date`, lalu `frequency`. */
  rows: MacroRowTuple[];
}

// ---------------------------------------------------------------------------
// latest.json

export interface Change {
  /** Selisih rupiah terhadap titik sebelumnya. */
  abs: number;
  /** Selisih dalam persen (`abs / prev × 100`). */
  pct: number;
}

export interface PricePoint {
  date: string;
  sell: number | null;
  buyback: number | null;
}

/**
 * Sparkline: satu nilai per hari kalender dari `start` sampai `end` (inklusif, 30 hari);
 * null = tidak ada data hari itu. `buyback` null bila tidak ada buyback sama sekali.
 */
export interface Spark {
  start: string;
  end: string;
  sell: (number | null)[];
  buyback: (number | null)[] | null;
}

/** Harga terbaru satu series (source × brand × product × variant × w). */
export interface LatestSeries extends SeriesRef {
  key: string;
  file: string;
  date: string;
  sell: number | null;
  buyback: number | null;
  source_updated_at: string | null;
  /** Observasi sebelumnya di series yang sama ("vs kemarin"); null bila baru satu titik. */
  prev: PricePoint | null;
  change: { sell: Change | null; buyback: Change | null };
  /** `sell − buyback` dan persennya terhadap jual; null bila salah satu kosong. */
  spread: number | null;
  spread_pct: number | null;
  /** `false` bila series berhenti sebelum tanggal terakhir file (mis. UBS `variant=''`, D-28). */
  current: boolean;
  spark: Spark;
}

/**
 * Kartu Hari ini per source × brand × product. Nilai dalam **satuan tampilan**:
 * per keping 1 g untuk emas fisik, per gram untuk Tabungan Emas (= harga ÷ `w`).
 */
export interface Highlight {
  file: string;
  source: PriceSource;
  brand: Brand;
  product: Product;
  kind: ProductKind;
  display: 'keping_1g' | 'per_gram';
  /** Series sumber angka (lihat `LatestFile.series`). */
  series_key: string;
  variant: string;
  w: number;
  date: string;
  source_updated_at: string | null;
  sell: number | null;
  buyback: number | null;
  prev: PricePoint | null;
  change: { sell: Change | null; buyback: Change | null };
  spread: number | null;
  spread_pct: number | null;
  /**
   * Buyback spark UBS disambung dari seri backfill `variant=''` untuk hari tanpa seri tahun
   * produksi (D-28). `spliced_from` = variant penyambung, null bila tidak disambung.
   */
  spark: Spark & { spliced_from: string | null };
}

export interface LatestSource {
  source: PriceSource;
  last_data_date: string | null;
  /** `source_updated_at` terbaru pada `last_data_date`; null = sumber tanpa jam (UBS, D-19). */
  source_updated_at: string | null;
}

export interface LatestSpot {
  snapshot: SpotSnapshot;
  /** Rp/gram spot = XAU/USD × kurs ÷ 31,1035. */
  idr_gram: number;
  /** Premi Antam LM 1 g vs penutupan spot sebelum tanggal harga (DATA-MODEL §6.2); null bila tidak bisa. */
  premium_antam: { date: string; sell: number; spot_date: string; pct: number } | null;
}

/** `public/data/latest.json` — semua yang dibutuhkan halaman Hari ini. */
export interface LatestFile {
  schema_version: string;
  /** Tanggal data ritel terbaru di semua sumber. */
  as_of: string | null;
  sources: LatestSource[];
  highlights: Highlight[];
  series: LatestSeries[];
  /** null bila `data/macro/spot.json` belum ada. */
  spot: LatestSpot | null;
}

// ---------------------------------------------------------------------------
// meta.json

export interface MetaSource {
  id: ScraperId;
  kind: 'prices' | 'macro';
  label: string;
  url: string;
  enabled: boolean;
  update_calendar: UpdateCalendar;
  status: {
    last_status: RunStatus;
    last_success_at: string | null;
    last_data_date: string | null;
    consecutive_failures: number;
    updated_at: string;
  } | null;
  /** Tanggal data terakhir di CSV (sumber harga) atau dari status.json (sumber makro). */
  last_data_date: string | null;
  source_updated_at: string | null;
  /** Umur data dalam hari kalender saat build (tanggal Jakarta); null bila belum ada data. */
  data_age_days: number | null;
}

/** Gramasi aktif per source × brand × product dari catalog.yml (tab dan kolom tabel). */
export interface MetaCatalogGroup {
  source: PriceSource;
  brand: Brand;
  product: Product;
  kind: ProductKind;
  weights: number[];
}

export interface MetaSeriesFile {
  file: string;
  source: PriceSource;
  brand: Brand;
  product: Product;
  kind: ProductKind;
  /** Path relatif terhadap `/data/`. */
  json: string;
  csv: string;
  rows: number;
  first_date: string;
  last_date: string;
}

export interface MetaSeries extends SeriesRef {
  key: string;
  file: string;
  rows: number;
  first_date: string;
  last_date: string;
  first_sell_date: string | null;
  first_buyback_date: string | null;
}

export interface MetaMacroSeries {
  id: Series;
  concept: 'gold_usd' | 'usd_idr';
  unit: MacroUnit;
  source: MacroSource;
  precedence: number;
  frequencies: Frequency[];
  rows: number;
  first_date: string | null;
  last_date: string | null;
  /** null bila belum ada data. */
  json: string | null;
  csv: string | null;
}

export interface DownloadFileRef {
  label: string;
  json: string;
  csv: string;
  rows: number;
}

export interface DownloadLastRetail {
  kind: 'retail';
  brand: Brand;
  product: Product;
  variant: string;
  /** Berat apa adanya (1 untuk emas fisik, 0,01 untuk Tabungan Emas). */
  w: number;
  date: string;
  sell: number | null;
  buyback: number | null;
}

export interface DownloadLastMacro {
  kind: 'macro';
  series: Series;
  date: string;
  frequency: Frequency;
  value: number;
  unit: MacroUnit;
}

/** Satu kartu unduhan halaman Data. */
export interface DownloadEntry {
  id: string;
  group: 'retail' | 'macro';
  label: string;
  color: ColorToken;
  files: DownloadFileRef[];
  rows: number;
  first_date: string | null;
  last_date: string | null;
  /** Jam data terakhir; null = sumber tanpa jam atau seri tanpa jam. */
  last_updated_at: string | null;
  /** Seri statis yang tidak diperbarui lagi (USD/IDR tahunan). */
  static: boolean;
  last: DownloadLastRetail | DownloadLastMacro | null;
}

/** `public/data/meta.json`. */
export interface MetaFile {
  schema_version: string;
  built_at: string;
  as_of: string | null;
  sources: MetaSource[];
  catalog: MetaCatalogGroup[];
  files: MetaSeriesFile[];
  series: MetaSeries[];
  macro: MetaMacroSeries[];
  events: EventConfig[];
  downloads: DownloadEntry[];
}

/** Token warna Tailwind (`globals.css`). */
export type ColorToken = 'antam' | 'ubs' | 'g24' | 'tab' | 'gold' | 'muted';
