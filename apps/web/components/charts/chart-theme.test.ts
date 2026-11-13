import { describe, expect, it } from 'vitest';
import {
  cssColor,
  escapeHtml,
  FALLBACK_TOKENS,
  formatAxisDate,
  formatDateShort,
  formatPercent,
  formatRupiah,
  formatRupiahShort,
  formatTooltipDate,
  isoToTime,
  readTokens,
  resolveColor,
  spanBucket,
  timeToIso,
  tooltipHtml,
  valueFormatters,
} from './chart-theme';

const lookup = (name: string) => ({ antam: '#ddb563', tab: '#5fd0b8' })[name] ?? '';

describe('warna', () => {
  it('menerjemahkan nama token, var(), dan --nama lewat lookup', () => {
    expect(resolveColor('antam', lookup)).toBe('#ddb563');
    expect(resolveColor('var(--tab)', lookup)).toBe('#5fd0b8');
    expect(resolveColor('--tab', lookup)).toBe('#5fd0b8');
  });
  it('meneruskan warna literal dan memakai cadangan untuk token tak dikenal', () => {
    expect(resolveColor('#123456', lookup)).toBe('#123456');
    expect(resolveColor('rgba(1,2,3,.5)', lookup)).toBe('rgba(1,2,3,.5)');
    expect(resolveColor('nope', lookup, '#000')).toBe('#000');
  });
  it('cssColor menghasilkan var() untuk SVG/HTML', () => {
    expect(cssColor('ubs')).toBe('var(--ubs)');
    expect(cssColor('var(--ubs)')).toBe('var(--ubs)');
    expect(cssColor('#fff')).toBe('#fff');
  });
  it('readTokens memakai cadangan bila variabel kosong', () => {
    const t = readTokens((n) => (n === 'grid' ? '#eceae4' : ''));
    expect(t.grid).toBe('#eceae4');
    expect(t.surface2).toBe(FALLBACK_TOKENS.surface2);
  });
});

describe('format angka', () => {
  it('rupiah lengkap dan ringkas', () => {
    expect(formatRupiah(2396500)).toBe('Rp2.396.500');
    expect(formatRupiah(null)).toBe('—');
    expect(formatRupiah(-1500.4)).toBe('−Rp1.500');
    expect(formatRupiahShort(2_345_000)).toBe('Rp2,35 jt');
    expect(formatRupiahShort(850_000)).toBe('Rp850 rb');
    expect(formatRupiahShort(1_200_000_000)).toBe('Rp1,20 M');
  });
  it('persen dengan koma desimal', () => {
    expect(formatPercent(4.8512)).toBe('4,85%');
    expect(formatPercent(4.8, 1)).toBe('4,8%');
    expect(formatPercent(undefined)).toBe('—');
  });
  it('valueFormatters memisahkan sumbu (ringkas) dan tooltip (lengkap)', () => {
    const rp = valueFormatters('rupiah');
    expect(rp.axis(2_350_000)).toBe('Rp2,35 jt');
    expect(rp.tooltip(2_350_000)).toBe('Rp2.350.000');
    const custom = valueFormatters((v) => `x${v}`);
    expect(custom.axis(2)).toBe('x2');
    expect(custom.tooltip(null)).toBe('—');
  });
});

describe('format tanggal', () => {
  const t = isoToTime('2026-10-30');
  it('ISO ↔ timestamp UTC', () => {
    expect(t).toBe(Date.UTC(2026, 9, 30));
    expect(timeToIso(t)).toBe('2026-10-30');
    expect(Number.isNaN(isoToTime('bukan tanggal'))).toBe(true);
  });
  it('label sumbu mengikuti lebar rentang', () => {
    expect(formatAxisDate(t, 30)).toBe('30 Okt');
    expect(formatAxisDate(t, 365)).toBe('Okt 26');
    expect(formatAxisDate(t, 3650)).toBe('2026');
    expect([spanBucket(120), spanBucket(121), spanBucket(5000)]).toEqual([0, 1, 2]);
  });
  it('judul tooltip "Jum, 30 Okt 2026"', () => {
    expect(formatTooltipDate(t)).toBe('Jum, 30 Okt 2026');
    expect(formatDateShort(isoToTime('2026-01-04'))).toBe('4 Jan 2026');
  });
});

describe('tooltip', () => {
  it('meng-escape label dan memakai warna token', () => {
    const html = tooltipHtml(
      'Jum, 30 Okt 2026',
      [{ label: '<b>A</b>', color: '#f00', value: 'Rp1' }],
      FALLBACK_TOKENS,
    );
    expect(html).toContain('&lt;b&gt;A&lt;/b&gt;');
    expect(html).toContain(FALLBACK_TOKENS.muted);
    expect(html).toContain('stroke="#f00"');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });
});
