import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const alt = 'Harga Emas Historis — harga emas batangan Indonesia';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: '#0E0F12',
        color: '#F4F4F1',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, color: '#DDB563' }}>
        HARGA EMAS BATANGAN INDONESIA
      </div>
      <div style={{ display: 'flex', fontSize: 104, fontWeight: 700, marginTop: 24 }}>
        Harga Emas Historis
      </div>
      <div style={{ display: 'flex', fontSize: 36, color: '#A6A8AE', marginTop: 28 }}>
        Jual, buyback, dan spread Antam, UBS, Galeri24, dan Pegadaian
      </div>
      <div
        style={{ display: 'flex', width: 220, height: 6, background: '#DDB563', marginTop: 48 }}
      />
    </div>,
    size,
  );
}
