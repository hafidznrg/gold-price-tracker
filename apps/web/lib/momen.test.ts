import { describe, expect, it } from 'vitest';
import { buildMomen } from './momen';

type C = Parameters<typeof buildMomen>[0][number];

const days = (n: number, f: (i: number) => number | null) =>
  Array.from({ length: n }, (_, i) => f(i));

function card(id: string, title: string, o: Partial<C> = {}): C {
  return {
    id,
    kind: 'fisik',
    title,
    sell: 1000,
    buyback: 950,
    spreadPct: 5,
    sellSpark: days(30, () => 1000),
    buySpark: days(30, () => 950),
    ...o,
  };
}

const hasBoth = (m: { href: string }[]) => m.some((x) => x.href.includes('v=both'));

describe('buildMomen: spread melebar', () => {
  // Spark: jual 1000, buyback 900 → rata-rata spread 10%.
  const wide = (id: string, title: string, today: number): C =>
    card(id, title, {
      spreadPct: today,
      sellSpark: days(30, () => 1000),
      buySpark: days(30, () => 900),
    });

  it('menyebut brand dan tautan v=both', () => {
    const m = buildMomen([wide('logammulia-antam', 'Antam', 18)]);
    expect(m[0]).toEqual({
      text: 'Spread Antam 18,0%, 1,8× rata-rata 30 hari (10,0%).',
      href: '/explorer?b=lm-antam&v=both',
    });
  });
  it('beberapa brand: rasio terbesar + "+n brand lain"', () => {
    const m = buildMomen([
      wide('logammulia-antam', 'Antam', 14),
      wide('galeri24-galeri24', 'Galeri24', 20),
      wide('ubslifestyle-ubs', 'UBS', 13),
    ]);
    expect(m[0]?.text).toBe(
      'Spread Galeri24 20,0%, 2,0× rata-rata 30 hari (10,0%); +2 brand lain juga melebar.',
    );
    expect(m[0]?.href).toBe('/explorer?b=g24-g24&v=both');
  });
  it('rasio seri: urutan kartu menentukan', () => {
    const m = buildMomen([
      wide('logammulia-antam', 'Antam', 15),
      wide('galeri24-galeri24', 'G', 15),
    ]);
    expect(m[0]?.href).toBe('/explorer?b=lm-antam&v=both');
  });
  it('rasio < 1,25 atau < 10 hari pasangan dilewati', () => {
    expect(hasBoth(buildMomen([wide('logammulia-antam', 'Antam', 12)]))).toBe(false);
    const few = card('logammulia-antam', 'Antam', {
      spreadPct: 20,
      buySpark: days(30, (i) => (i < 9 ? 900 : null)),
    });
    expect(hasBoth(buildMomen([few]))).toBe(false);
    // null di sisi jual juga membuang pasangan
    const sellGaps = card('logammulia-antam', 'Antam', {
      spreadPct: 20,
      sellSpark: days(30, (i) => (i < 9 ? 1000 : null)),
      buySpark: days(30, () => 900),
    });
    expect(hasBoth(buildMomen([sellGaps]))).toBe(false);
  });
  it('tanpa buyback dilewati', () => {
    const c = card('x', 'X', { buyback: null, spreadPct: null, buySpark: null });
    expect(buildMomen([c])).toEqual([]);
  });
});

describe('buildMomen: posisi harga', () => {
  const rising = days(30, (i) => 1000 + i * 10);
  const falling = days(30, (i) => 1300 - i * 10);
  const at = (id: string, spark: (number | null)[], sell: number): C =>
    card(id, id, { sell, sellSpark: spark, buyback: null, spreadPct: null, buySpark: null });

  it('titik terendah: hitung dan tautan brand terkait', () => {
    const m = buildMomen([
      at('logammulia-antam', falling, 1010),
      at('galeri24-galeri24', falling, 1010),
      at('ubslifestyle-ubs', rising, 1100),
    ]);
    expect(m[0]).toEqual({
      text: 'Harga jual 2 dari 3 brand ada di titik terendah 30 hari.',
      href: '/explorer?b=lm-antam,g24-g24',
    });
  });
  it('semua brand di titik tertinggi; daftar sama dengan bawaan tidak ditulis', () => {
    const ids = ['logammulia-antam', 'ubslifestyle-ubs', 'galeri24-galeri24', 'hrtagold-emasku'];
    const m = buildMomen(ids.map((id) => at(id, rising, 1290)));
    expect(m[0]?.text).toBe('Harga jual semua 4 brand ada di titik tertinggi 30 hari.');
    expect(m[0]?.href).toBe('/explorer');
  });
  it('dilewati bila nol, data < 10 nilai, atau harga datar; null di spark diabaikan', () => {
    expect(buildMomen([at('a', rising, 1100)])).toEqual([]);
    expect(
      buildMomen([
        at(
          'a',
          days(9, (i) => 1000 - i),
          992,
        ),
      ]),
    ).toEqual([]);
    expect(
      buildMomen([
        at(
          'a',
          days(30, () => 1000),
          1000,
        ),
      ]),
    ).toEqual([]);
    const sparse = days(30, (i) => (i % 2 === 0 ? 2000 - i : null)); // 15 nilai, terendah 1972
    expect(buildMomen([at('logammulia-antam', sparse, 1972)])[0]?.text).toContain('semua 1 brand');
    // Brand baru (data < 10 hari) ikut dihitung sebagai kartu: bukan "semua".
    const fresh = at(
      'hrtagold-emasku',
      days(30, (i) => (i < 29 ? null : 1500)),
      1500,
    );
    expect(buildMomen([at('logammulia-antam', sparse, 1972), fresh])[0]?.text).toContain(
      '1 dari 2 brand',
    );
  });
});

describe('buildMomen: bolak-balik tersempit', () => {
  it('fisik tersempit saja', () => {
    const m = buildMomen([
      card('logammulia-antam', 'Antam', { spreadPct: 8.123 }),
      card('galeri24-galeri24', 'Galeri24', { spreadPct: 5.956 }),
      card('x', 'Tanpa', { buyback: null, spreadPct: null, buySpark: null }),
    ]);
    expect(m.at(-1)).toEqual({
      text: 'Selisih jual-beli tersempit: Galeri24 5,96%.',
      href: '/explorer?b=lm-antam,g24-g24&v=spread',
    });
  });
  it('Tabungan Emas tersempit: sebut keping fisik tersempit; seri → urutan kartu', () => {
    const m = buildMomen([
      card('logammulia-antam', 'Antam', { spreadPct: 8 }),
      card('galeri24-galeri24', 'Galeri24', { spreadPct: 5.9554 }),
      card('galeri24-lotusarchi', 'Lotus Archi', { spreadPct: 5.9554 }),
      card('pegadaian-pegadaian', 'Tabungan Emas', { kind: 'tabungan', spreadPct: 3.1915 }),
    ]);
    expect(m.at(-1)?.text).toBe(
      'Selisih jual-beli tersempit: Tabungan Emas 3,19% · keping fisik: Galeri24 5,96%.',
    );
    expect(m.at(-1)?.href).toBe('/explorer?b=lm-antam,g24-g24,g24-lotus,tab&v=spread');
  });
  it('dilewati bila kurang dari dua kartu ber-buyback', () => {
    expect(buildMomen([card('a', 'A')])).toEqual([]);
    expect(buildMomen([])).toEqual([]);
  });
  it('ketiga aturan sekaligus menghasilkan 3 kalimat berurutan', () => {
    const wideAntam = card('logammulia-antam', 'Antam', {
      spreadPct: 20,
      sell: 1000,
      sellSpark: days(30, () => 1000),
      buySpark: days(30, () => 900),
    });
    const other = card('galeri24-galeri24', 'Galeri24', {
      spreadPct: 5,
      sell: 1010,
      sellSpark: days(30, (i) => 1300 - i * 10),
    });
    const m = buildMomen([wideAntam, other]);
    expect(m).toHaveLength(3);
    expect(m[0]?.text).toMatch(/^Spread Antam/);
    expect(m[1]?.text).toMatch(/^Harga jual/);
    expect(m[2]?.text).toMatch(/^Selisih/);
  });
});
