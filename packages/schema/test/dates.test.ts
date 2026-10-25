import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  isIsoDate,
  jakartaDate,
  jakartaIso,
  jakartaToday,
  utcIso,
  weekdayIso,
} from '../src';

describe('tanggal Asia/Jakarta', () => {
  it('jakartaDate memakai tanggal Jakarta, bukan UTC', () => {
    // 2026-10-24 18:30 UTC = 2026-10-25 01:30 WIB
    expect(jakartaDate(new Date('2026-10-24T18:30:00Z'))).toBe('2026-10-25');
    expect(jakartaDate(new Date('2026-10-24T16:59:59Z'))).toBe('2026-10-24');
  });

  it('jakartaDate menerima epoch milidetik (endpoint Logam Mulia)', () => {
    expect(jakartaDate(Date.UTC(2026, 9, 23, 17, 0, 0))).toBe('2026-10-24');
  });

  it('jakartaToday', () => {
    expect(jakartaToday(new Date('2026-10-25T03:31:40Z'))).toBe('2026-10-25');
  });

  it('jakartaIso menulis offset +07:00', () => {
    expect(jakartaIso(new Date('2026-10-24T03:12:08Z'))).toBe('2026-10-24T10:12:08+07:00');
  });

  it('utcIso tanpa milidetik', () => {
    expect(utcIso(new Date('2026-10-24T03:31:40.123Z'))).toBe('2026-10-24T03:31:40Z');
  });
});

describe('util tanggal kalender', () => {
  it.each([
    ['2026-10-24', true],
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['20261024', false],
  ])('isIsoDate(%s) = %s', (input, expected) => {
    expect(isIsoDate(input)).toBe(expected);
  });

  it('addDaysIso melewati batas bulan dan tahun', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(() => addDaysIso('2026-02-30', 1)).toThrow();
  });

  it('weekdayIso', () => {
    expect(weekdayIso('2026-10-24')).toBe(6); // Sabtu
    expect(weekdayIso('2026-10-25')).toBe(0); // Minggu
  });
});
