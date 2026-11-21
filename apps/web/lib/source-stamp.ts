import type { PriceSource } from '@gold/schema';
import { formatDate, formatTimeWib } from './format';

/**
 * Teks atribusi per sumber (mockup: "Sumber: logammulia.com · terakhir diperbarui 30 Okt 2026, 08.32 WIB").
 * - UBS Lifestyle: tanpa jam yang dapat dipercaya → tanggal saja (D-19), walau `at` diberikan.
 * - Pegadaian: `source_updated_at` = waktu entri harga diterbitkan (±10.00–10.30 WIB, dari `idHarga`
 *   / `id` epoch ms), bukan jam snapshot 18.32 (D-25) → ditulis "harga terbit", bukan "snapshot".
 * - Lotus Archi (lotusarchi.com): halaman tanpa jam terbit → tanggal saja (D-65).
 * - Hartadinata (hrtagold.id): `updated_date` API = waktu terbit tabel → tanggal + jam, "harga terbit" (P7-03).
 * - Logam Mulia: "Terakhir diperbarui" dari situs (D-26).
 */
const SOURCE_DOMAIN: Record<PriceSource, string> = {
  logammulia: 'logammulia.com',
  pegadaian: 'pegadaian.co.id',
  ubslifestyle: 'ubslifestyle.com',
  galeri24: 'galeri24.co.id',
  lotusarchi: 'lotusarchi.com',
  hrtagold: 'hrtagold.id',
};

const SOURCE_VERB: Record<PriceSource, string> = {
  logammulia: 'terakhir diperbarui',
  pegadaian: 'harga terbit',
  ubslifestyle: 'data',
  galeri24: 'harga terbit',
  lotusarchi: 'data',
  hrtagold: 'harga terbit',
};

/** Bagian-bagian atribusi untuk tata letak berkolom: domain dan keterangan waktu. */
export function sourceStampParts(
  source: PriceSource,
  date: string,
  at: string | null,
): { domain: string; when: string } {
  const time =
    source === 'ubslifestyle' || source === 'lotusarchi' || !at
      ? formatDate(date)
      : `${formatDate(date)}, ${formatTimeWib(at)}`;
  return { domain: SOURCE_DOMAIN[source], when: `${SOURCE_VERB[source]} ${time}` };
}

export function sourceStampText(source: PriceSource, date: string, at: string | null): string {
  const { domain, when } = sourceStampParts(source, date, at);
  return `Sumber: ${domain} · ${when}`;
}
