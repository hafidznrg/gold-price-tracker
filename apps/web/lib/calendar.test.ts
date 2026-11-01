import { describe, expect, it } from 'vitest';
import { calendarFromMeta, expectedFor, labelGaps } from './calendar';

const cal = calendarFromMeta({
  sources: [
    { id: 'ubslifestyle', update_calendar: 'business_days_id' },
    { id: 'logammulia', update_calendar: 'daily' },
  ] as never,
  holidays: ['2026-01-01'],
});

describe('expectedFor', () => {
  it('mengikuti kalender tiap sumber dan libur', () => {
    const ubs = expectedFor(cal, ['ubslifestyle']);
    expect(ubs('2026-01-01')).toBe(false); // libur
    expect(ubs('2026-01-04')).toBe(false); // Minggu
    expect(ubs('2026-01-05')).toBe(true);
    expect(expectedFor(cal, ['logammulia'])('2026-01-04')).toBe(true);
    // Pasangan: harus terbit di keduanya.
    expect(expectedFor(cal, ['logammulia', 'ubslifestyle'])('2026-01-04')).toBe(false);
  });
});

describe('labelGaps', () => {
  it('label hanya bila celah sedikit', () => {
    const g = { from: '2026-01-01', to: '2026-01-02' };
    expect(labelGaps([g])[0]?.label).toBe('Tidak ada data');
    expect(labelGaps([g, g, g])[0]?.label).toBeUndefined();
  });
});

describe('salinan isExpectedDay', () => {
  it('sama dengan @gold/schema untuk semua kalender sepanjang 2026', async () => {
    const { isExpectedDay } = await import('@gold/schema');
    const holidays = ['2026-01-01', '2026-03-19', '2026-12-25'];
    const calendars = ['daily', 'weekdays', 'business_days_id', 'monthly'] as const;
    for (const c of calendars) {
      const web = expectedFor({ calendars: { s: c }, holidays }, ['s']);
      for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2026, 11, 31); t += 86_400_000) {
        const d = new Date(t).toISOString().slice(0, 10);
        expect(web(d), `${c} ${d}`).toBe(
          isExpectedDay(
            c,
            d,
            holidays.map((date) => ({ date })),
          ),
        );
      }
    }
  });
});
