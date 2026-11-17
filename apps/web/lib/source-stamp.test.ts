import { describe, expect, it } from 'vitest';
import { sourceStampParts, sourceStampText } from './source-stamp';

describe('sourceStampText', () => {
  it('Logam Mulia: tanggal + jam', () => {
    expect(sourceStampText('logammulia', '2026-10-30', '2026-10-30T08:32:00+07:00')).toBe(
      'Sumber: logammulia.com · terakhir diperbarui 30 Okt 2026, 08.32 WIB',
    );
  });
  it('UBS: tanggal saja walau ada jam (D-19)', () => {
    expect(sourceStampText('ubslifestyle', '2026-10-30', '2026-10-30T08:32:00+07:00')).toBe(
      'Sumber: ubslifestyle.com · data 30 Okt 2026',
    );
  });
  it('Pegadaian: harga terbit, bukan snapshot', () => {
    expect(sourceStampText('pegadaian', '2026-10-31', '2026-10-31T10:27:58+07:00')).toBe(
      'Sumber: pegadaian.co.id · harga terbit 31 Okt 2026, 10.27 WIB',
    );
  });
  it('Galeri24: harga terbit', () => {
    expect(sourceStampText('galeri24', '2026-11-17', '2026-11-17T09:30:00+07:00')).toBe(
      'Sumber: galeri24.co.id · harga terbit 17 Nov 2026, 09.30 WIB',
    );
  });
  it('tanpa jam → tanggal saja', () => {
    expect(sourceStampText('pegadaian', '2026-10-31', null)).toBe(
      'Sumber: pegadaian.co.id · harga terbit 31 Okt 2026',
    );
  });
});

describe('sourceStampParts', () => {
  it('memisahkan domain dan keterangan waktu', () => {
    expect(sourceStampParts('logammulia', '2026-10-30', '2026-10-30T08:32:00+07:00')).toEqual({
      domain: 'logammulia.com',
      when: 'terakhir diperbarui 30 Okt 2026, 08.32 WIB',
    });
  });
});
