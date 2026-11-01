import { describe, expect, it } from 'vitest';
import {
  formatChange,
  formatChangeRupiah,
  formatDataAge,
  formatDataStamp,
  formatDate,
  formatDateLong,
  formatJakartaStamp,
  formatPct,
  formatRupiah,
  formatRupiahShort,
  formatTimeWib,
  formatWeight,
} from './format';

describe('format', () => {
  it('rupiah', () => {
    expect(formatRupiah(2_512_000)).toBe('Rp2.512.000');
    expect(formatRupiah(23_850.4)).toBe('Rp23.850');
    expect(formatRupiah(null)).toBe('—');
    expect(formatRupiah(-4000)).toBe('−Rp4.000');
    expect(formatRupiah(18_086.45, 2)).toBe('Rp18.086,45');
    expect(formatRupiahShort(2_510_000)).toBe('Rp2,51 jt');
  });

  it('persen dan perubahan', () => {
    expect(formatPct(0.6412)).toBe('+0,64%');
    expect(formatPct(-1.2)).toBe('−1,20%');
    expect(formatPct(0)).toBe('0,00%');
    expect(formatPct(6.13, 2, false)).toBe('6,13%');
    expect(formatChangeRupiah(16_000)).toBe('▲ +Rp16.000');
    expect(formatChangeRupiah(-4_000)).toBe('▼ −Rp4.000');
    expect(formatChange({ abs: -20000, pct: -0.7855 })).toBe('▼ −Rp20.000 · −0,79%');
    expect(formatChange(null)).toBe('—');
  });

  it('gramasi', () => {
    expect(formatWeight(0.5)).toBe('0,5 g');
    expect(formatWeight(0.01)).toBe('0,01 g');
    expect(formatWeight(1000)).toBe('1.000 g');
  });

  it('tanggal dan jam WIB', () => {
    expect(formatDate('2026-10-30')).toBe('30 Okt 2026');
    expect(formatDate('2026-10-30', false)).toBe('30 Okt');
    expect(formatDateLong('2026-10-30')).toBe('Jumat, 30 Oktober 2026');
    expect(formatTimeWib('2026-10-30T08:32:00+07:00')).toBe('08.32 WIB');
    expect(formatTimeWib('2026-10-30T11:32:00Z')).toBe('18.32 WIB');
    expect(formatDataStamp('2026-10-30', '2026-10-30T08:32:00+07:00')).toBe(
      '30 Okt 2026 · 08.32 WIB',
    );
    expect(formatDataStamp('2026-10-30', null)).toBe('30 Okt 2026');
    expect(formatJakartaStamp(new Date('2026-10-30T09:52:00Z'))).toBe('30 Okt 2026 16.52 WIB');
  });

  it('umur data', () => {
    const now = new Date('2026-10-30T14:10:00Z'); // 21.10 WIB
    expect(formatDataAge({ at: '2026-10-30T08:32:00+07:00' }, now)).toBe('13 jam lalu');
    expect(formatDataAge({ at: '2026-10-30T18:32:00+07:00' }, now)).toBe('3 jam lalu');
    expect(formatDataAge({ at: '2026-10-30T21:00:00+07:00' }, now)).toBe('10 menit lalu');
    expect(formatDataAge({ at: '2026-10-30T21:10:00+07:00' }, now)).toBe('baru saja');
    expect(formatDataAge({ at: '2026-10-28T08:00:00+07:00' }, now)).toBe('2 hari lalu');
    expect(formatDataAge({ date: '2026-10-30' }, now)).toBe('hari ini');
    expect(formatDataAge({ date: '2026-10-29' }, now)).toBe('1 hari lalu');
    // 31 Okt 00.30 WIB: tanggal Jakarta sudah berganti.
    expect(formatDataAge({ date: '2026-10-30' }, new Date('2026-10-30T17:30:00Z'))).toBe(
      '1 hari lalu',
    );
    expect(formatDataAge({ isStatic: true, date: '1998-01-01' }, now)).toBe('tidak diperbarui');
    expect(formatDataAge({}, now)).toBe('—');
  });
});
