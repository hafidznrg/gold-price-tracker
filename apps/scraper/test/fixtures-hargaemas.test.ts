import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRupiah } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { tableRows, tables } from '../src/html';

// Riset P1-06 (26 Okt 2026): harga-emas.org sebagai sumber sekunder harga Antam, dibandingkan
// dengan teks halaman resmi logammulia.com/harga-emas pada hari yang sama. Tes ini mengunci
// alasan sumber itu belum dipakai (D-24). Bila diperbarui dan tes ini gagal, nilai ulang D-24.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(HERE, 'fixtures', rel), 'utf8');

/** Teks halaman resmi: blok "Emas Batangan" → gram → Harga Dasar. */
function officialBars(): Map<number, number> {
  const lines = read('logammulia/harga-emas-2026-10-26-text.txt').split('\n');
  const start = lines.indexOf('Emas Batangan');
  const end = lines.indexOf('Perak Batangan');
  const out = new Map<number, number>();
  for (let i = start; i < end; i++) {
    const m = /^([\d.]+) gr$/.exec(lines[i]!);
    if (m) out.set(Number(m[1]), Number(lines[i + 1]!.replace(/\D/g, '')));
  }
  return out;
}

/** Tabel harga-emas.org: baris `Gram | Antam | Pegadaian | …`. */
function hargaEmasAntam(file: string): Map<number, number> {
  const table = tables(read(file)).find((t) => t.includes('Antam'))!;
  const out = new Map<number, number>();
  for (const [gram, antam] of tableRows(table)) {
    if (/^[\d.]+$/.test(gram ?? '') && antam) out.set(Number(gram), parseRupiah(antam));
  }
  return out;
}

describe('halaman resmi logammulia.com/harga-emas (26 Okt 2026)', () => {
  it('Emas Batangan: 12 gramasi, Harga Dasar 1 g Rp2.540.000', () => {
    const bars = officialBars();
    expect([...bars.keys()]).toEqual([0.5, 1, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000]);
    expect(bars.get(1)).toBe(2_540_000);
  });
});

describe('harga-emas.org vs resmi', () => {
  it('beranda 26 Okt: 8 gramasi cocok, tetapi 0,5 / 1 / 10 g berasal dari produk lain', () => {
    const official = officialBars();
    const mirror = hargaEmasAntam('hargaemas/home-table-2026-10-26.html');
    const mismatched = [...mirror].filter(([g, v]) => official.get(g) !== v).map(([g]) => g);
    expect(mismatched.sort((a, b) => a - b)).toEqual([0.5, 1, 10]);
    // 1 g dan 0,5 g = Gift Series; 10 g = Batik Seri III (lihat teks halaman resmi).
    expect(mirror.get(1)).toBe(2_690_000);
    expect(mirror.get(10)).toBe(25_900_000);
    // 3 g tidak ada di tabel harga-emas.org.
    expect(mirror.has(3)).toBe(false);
  });

  it('histori 9 Okt: Antam 1 g Rp2.572.000 (sama dengan angka resmi yang dikutip berita)', () => {
    expect(hargaEmasAntam('hargaemas/history-2026-10-09-table.html').get(1)).toBe(2_572_000);
  });

  it('histori 31 Agu: tidak ada kolom Antam', () => {
    expect(read('hargaemas/history-2026-08-31-table.html')).not.toContain('Antam');
  });
});
