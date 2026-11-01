import type { PriceSource } from '@gold/schema';
import { formatDate, formatTimeWib } from './format';

/**
 * Teks atribusi per sumber (mockup: "Sumber: logammulia.com · terakhir diperbarui 30 Okt 2026, 08.32 WIB").
 * - UBS Lifestyle: tanpa jam yang dapat dipercaya → tanggal saja (D-19), walau `at` diberikan.
 * - Pegadaian: `source_updated_at` = waktu entri harga diterbitkan (±10.00–10.30 WIB, dari `idHarga`
 *   / `id` epoch ms), bukan jam snapshot 18.32 (D-25) → ditulis "harga terbit", bukan "snapshot".
 * - Logam Mulia: "Terakhir diperbarui" dari situs (D-26).
 */
const SOURCE_DOMAIN: Record<PriceSource, string> = {
  logammulia: 'logammulia.com',
  pegadaian: 'pegadaian.co.id',
  ubslifestyle: 'ubslifestyle.com',
};

const SOURCE_VERB: Record<PriceSource, string> = {
  logammulia: 'terakhir diperbarui',
  pegadaian: 'harga terbit',
  ubslifestyle: 'data',
};

export function sourceStampText(source: PriceSource, date: string, at: string | null): string {
  const when =
    source === 'ubslifestyle' || !at
      ? formatDate(date)
      : `${formatDate(date)}, ${formatTimeWib(at)}`;
  return `Sumber: ${SOURCE_DOMAIN[source]} · ${SOURCE_VERB[source]} ${when}`;
}
