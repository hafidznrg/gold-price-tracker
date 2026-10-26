import { expandCatalog, type CatalogItem } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { validate, type ValidateInput } from '../src/pipeline/validate';
import type { Candidate } from '../src/pipeline/upsert';
import { candidate, stored, ubsDay } from './helpers';

const catalog: CatalogItem[] = expandCatalog({
  items: [
    {
      source: 'ubslifestyle',
      brand: 'ubs',
      product: 'gold_bar',
      weights: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 10, 25, 50, 100],
      active_from: '2010-01-01',
      active_to: null,
    },
    ...(['antam', 'ubs', 'galeri24'] as const).map((brand) => ({
      source: 'pegadaian' as const,
      brand,
      product: 'gold_bar',
      weights: [0.5, 1, 2, 5, 10, 25],
      active_from: '2010-01-01',
      active_to: null,
    })),
    {
      source: 'logammulia',
      brand: 'antam',
      product: 'gold_bar',
      weights: [0.5, 1, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000],
      active_from: '2010-01-01',
      active_to: null,
    },
  ],
});

const TODAY = '2026-10-26';

const input = (rows: Candidate[], over: Partial<ValidateInput> = {}): ValidateInput => ({
  source: 'ubslifestyle',
  parsed: { rows, dataDate: TODAY, sourceUpdatedAt: null, stale: null },
  catalog,
  existing: [],
  today: TODAY,
  ...over,
});

const pegadaianDay = (brands = ['antam', 'ubs', 'galeri24'] as const, n = 5) =>
  brands.flatMap((brand) =>
    [0.5, 1, 2, 5, 10, 25].slice(0, n).map((w) =>
      candidate({
        source: 'pegadaian',
        brand,
        variant: '',
        weight_g: w,
        sell_price: Math.round(2_500_000 * w),
        buyback_price: null,
        source_updated_at: '2026-10-26T10:18:00+07:00',
      }),
    ),
  );

describe('validate — lolos', () => {
  it('13 pecahan UBS hari ini → ok, semua baris lolos', () => {
    const r = validate(input(ubsDay(TODAY)));
    expect(r.outcome).toBe('ok');
    if (r.outcome === 'ok') {
      expect(r.rows).toHaveLength(13);
      expect(r.held).toEqual([]);
    }
  });
});

describe('V-01 skema (run)', () => {
  it('baris tanpa harga → SCHEMA_INVALID', () => {
    const rows = ubsDay(TODAY);
    rows[0] = { ...rows[0]!, sell_price: null, buyback_price: null };
    expect(validate(input(rows))).toMatchObject({
      outcome: 'failed',
      error_code: 'SCHEMA_INVALID',
    });
  });

  it('harga desimal → SCHEMA_INVALID', () => {
    const rows = ubsDay(TODAY);
    rows[1] = { ...rows[1]!, sell_price: 1000.5 };
    expect(validate(input(rows))).toMatchObject({
      outcome: 'failed',
      error_code: 'SCHEMA_INVALID',
    });
  });

  it('kunci duplikat → SCHEMA_INVALID', () => {
    const rows = [...ubsDay(TODAY), candidate({ date: TODAY })];
    const r = validate(input(rows));
    expect(r).toMatchObject({ outcome: 'failed', error_code: 'SCHEMA_INVALID' });
    expect(r.outcome === 'failed' && r.error_message).toContain('duplikat');
  });
});

describe('V-02 katalog (baris)', () => {
  it('gramasi tak dikenal → karantina UNKNOWN_ITEM, sisanya lolos', () => {
    const rows = [
      ...ubsDay(TODAY),
      candidate({
        date: TODAY,
        weight_g: 250,
        sell_price: 600_000_000,
        buyback_price: 570_000_000,
      }),
    ];
    const r = validate(input(rows));
    expect(r.outcome).toBe('ok');
    if (r.outcome === 'ok') {
      expect(r.rows).toHaveLength(13);
      expect(r.held).toEqual([{ reason_code: 'UNKNOWN_ITEM', rows: [rows[13]] }]);
    }
  });
});

describe('V-03 buyback < jual (run)', () => {
  it('buyback = jual → VALIDATION_FAILED', () => {
    const rows = ubsDay(TODAY);
    rows[4] = { ...rows[4]!, buyback_price: rows[4]!.sell_price };
    const r = validate(input(rows));
    expect(r).toMatchObject({ outcome: 'failed', error_code: 'VALIDATION_FAILED' });
    expect(r.outcome === 'failed' && r.error_message).toMatch(/^V-03/);
  });

  it('salah satu harga kosong → tidak dibandingkan', () => {
    const rows = ubsDay(TODAY);
    rows[4] = { ...rows[4]!, sell_price: null };
    expect(validate(input(rows)).outcome).toBe('ok');
  });
});

describe('V-04 jumlah baris minimum (run)', () => {
  it('UBS: 12 pecahan untuk tahun terbaru → gagal', () => {
    const r = validate(input(ubsDay(TODAY).slice(1)));
    expect(r).toMatchObject({ outcome: 'failed', error_code: 'VALIDATION_FAILED' });
    expect(r.outcome === 'failed' && r.error_message).toMatch(/^V-04: 12 pecahan untuk tahun 2026/);
  });

  it('UBS: tahun lama boleh lebih sedikit asalkan tahun terbaru lengkap', () => {
    const rows = [...ubsDay(TODAY), ...ubsDay(TODAY, 2_265_000, '2025').slice(0, 3)];
    expect(validate(input(rows)).outcome).toBe('ok');
  });

  it('Pegadaian: ≥ 5 gramasi per brand lolos, 4 untuk satu brand gagal', () => {
    const ok = validate(input(pegadaianDay(), { source: 'pegadaian' }));
    expect(ok.outcome).toBe('ok');
    const rows = [
      ...pegadaianDay(['antam', 'ubs'] as never),
      ...pegadaianDay(['galeri24'] as never, 4),
    ];
    const r = validate(input(rows, { source: 'pegadaian' }));
    expect(r).toMatchObject({ outcome: 'failed', error_code: 'VALIDATION_FAILED' });
    expect(r.outcome === 'failed' && r.error_message).toContain('galeri24 4 gramasi');
  });
});

describe('V-05 lonjakan harga (baris)', () => {
  const existing = ubsDay('2026-10-24').map((c) => stored(c));

  it('perubahan ≤ 10% lolos', () => {
    const r = validate(input(ubsDay(TODAY, 2_288_000 * 1.09), { existing }));
    expect(r.outcome === 'ok' && r.held).toEqual([]);
  });

  it('perubahan > 10% → karantina PRICE_JUMP', () => {
    const rows = ubsDay(TODAY);
    rows[4] = { ...rows[4]!, buyback_price: Math.round(2_288_000 * 0.85) };
    const r = validate(input(rows, { existing }));
    expect(r.outcome).toBe('ok');
    if (r.outcome === 'ok') {
      expect(r.rows).toHaveLength(12);
      expect(r.held).toEqual([{ reason_code: 'PRICE_JUMP', rows: [rows[4]] }]);
    }
  });

  it('dibandingkan dengan tanggal sebelumnya, bukan baris tanggal yang sama', () => {
    const sameDay = ubsDay(TODAY, 1_000_000).map((c) => stored(c));
    const r = validate(input(ubsDay(TODAY), { existing: sameDay }));
    expect(r.outcome === 'ok' && r.held).toEqual([]);
  });
});

describe('V-06 tanggal data (stale)', () => {
  it('tanggal data < hari ini → stale', () => {
    const r = validate(
      input(ubsDay('2026-10-24'), {
        parsed: {
          rows: ubsDay('2026-10-24'),
          dataDate: '2026-10-24',
          sourceUpdatedAt: null,
          stale: null,
        },
      }),
    );
    expect(r).toEqual({
      outcome: 'stale',
      reason: 'tanggal data 2026-10-24 ≠ hari ini 2026-10-26',
    });
  });

  it('sumber menandai dirinya basi (D-19) → stale walau tanggal = hari ini', () => {
    const r = validate(
      input(ubsDay(TODAY), {
        parsed: {
          rows: ubsDay(TODAY),
          dataDate: TODAY,
          sourceUpdatedAt: null,
          stale: 'grafik ≠ tabel',
        },
      }),
    );
    expect(r).toEqual({ outcome: 'stale', reason: 'grafik ≠ tabel' });
  });

  it('kegagalan run-level lebih diutamakan daripada stale', () => {
    const rows = ubsDay('2026-10-24').slice(2);
    const r = validate(
      input(rows, { parsed: { rows, dataDate: '2026-10-24', sourceUpdatedAt: null, stale: null } }),
    );
    expect(r.outcome).toBe('failed');
  });
});

describe('Logam Mulia: V-04 dan V-06', () => {
  const LM_WEIGHTS = [0.5, 1, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000];
  const lmDay = (date: string, weights = LM_WEIGHTS) =>
    weights.map((weight_g) =>
      candidate({
        source: 'logammulia',
        brand: 'antam',
        variant: '',
        location: 'jakarta',
        weight_g,
        date,
      }),
    );
  const lmInput = (rows: Candidate[], dataDate: string) =>
    input(rows, {
      source: 'logammulia',
      parsed: { rows, dataDate, sourceUpdatedAt: null, stale: null },
    });

  it('12 gramasi hari ini → ok', () => {
    expect(validate(lmInput(lmDay(TODAY), TODAY)).outcome).toBe('ok');
  });

  it('kurang dari 12 gramasi → gagal V-04', () => {
    const r = validate(lmInput(lmDay(TODAY, LM_WEIGHTS.slice(1)), TODAY));
    expect(r.outcome === 'failed' && r.error_message).toBe('V-04: 11 gramasi (minimal 12)');
  });

  it('tanggal data kemarin → stale', () => {
    const r = validate(lmInput(lmDay('2026-10-25'), '2026-10-25'));
    expect(r.outcome).toBe('stale');
  });
});

describe('V-11 revisi histori massal', () => {
  const days = Array.from({ length: 3 }, (_, i) => `2026-10-${String(20 + i).padStart(2, '0')}`);
  const existing = days.flatMap((d) => ubsDay(d).map((c) => stored(c)));
  /** Ubah buyback 1% pada `n` baris histori pertama. */
  const revised = (n: number) =>
    days
      .flatMap((d) => ubsDay(d))
      .map((c, i) => (i < n ? { ...c, buyback_price: Math.round(c.buyback_price! * 1.01) } : c));

  it('20 revisi histori → lolos', () => {
    const r = validate(input([...revised(20), ...ubsDay(TODAY)], { existing }));
    expect(r.outcome === 'ok' && r.held).toEqual([]);
  });

  it('21 revisi histori → seluruh batch ditahan MASS_REVISION', () => {
    const rows = [...revised(21), ...ubsDay(TODAY)];
    const r = validate(input(rows, { existing }));
    expect(r.outcome).toBe('ok');
    if (r.outcome === 'ok') {
      expect(r.rows).toEqual([]);
      expect(r.held).toHaveLength(1);
      expect(r.held[0]!.reason_code).toBe('MASS_REVISION');
      expect(r.held[0]!.rows).toHaveLength(rows.length);
    }
  });

  it('revisi tanggal kemarin tidak dihitung sebagai histori', () => {
    const yesterday = ubsDay('2026-10-25').map((c) => stored(c));
    const rows = ubsDay('2026-10-25', 2_300_000);
    const many = [...rows, ...rows.map((r) => ({ ...r, variant: '2025' }))];
    const r = validate(
      input([...many, ...ubsDay(TODAY)], {
        existing: [...yesterday, ...yesterday.map((r) => ({ ...r, variant: '2025' }))],
      }),
    );
    expect(r.outcome === 'ok' && r.held).toEqual([]);
  });
});
