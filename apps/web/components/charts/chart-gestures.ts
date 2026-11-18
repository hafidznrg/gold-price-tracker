/**
 * Matematika gestur zoom/geser grafik deret waktu — murni, tanpa DOM, agar bisa diuji.
 * Menggantikan interaksi bawaan dataZoom `inside` ECharts yang terlalu sensitif
 * (gulir ×1,1–1,4 dan cubit ×1,1 per event, apa pun besar deltanya).
 */
import { DAY_MS } from './chart-theme';

export interface ZoomWindow {
  start: number;
  end: number;
}

/** Lebar minimum jendela (selaras `minValueSpan` dataZoom). */
export const MIN_SPAN_MS = 3 * DAY_MS;
/** Pembesaran per piksel gulir: 1 takik roda mouse (~100 px) ≈ ×1,13. */
export const WHEEL_ZOOM_PER_PX = 0.0012;
/** Gulir + Ctrl (cubit touchpad di desktop) mengirim delta kecil → faktor lebih besar. */
export const WHEEL_ZOOM_PER_PX_CTRL = 0.006;
/** Delta gulir per event dijepit agar satu sentakan tidak melompat jauh. */
export const WHEEL_DELTA_CLAMP = 120;
/** Rasio geser: 1 = konten persis mengikuti jari; < 1 = lebih lambat/halus. */
export const PAN_SPEED = 0.75;
/** Jarak seret minimum (px) sebelum mulai menggeser — ketukan untuk tooltip tidak menggeser grafik. */
export const DRAG_THRESHOLD_PX = 6;

/** Jepit jendela ke rentang data dan lebar min/maks; posisi digeser (bukan dipotong) bila keluar. */
export function clampWindow(
  w: ZoomWindow,
  extent: [number, number],
  minSpan = MIN_SPAN_MS,
): ZoomWindow {
  const full = extent[1] - extent[0];
  const span = Math.min(full, Math.max(Math.min(minSpan, full), w.end - w.start));
  let start = w.start;
  if (start < extent[0]) start = extent[0];
  if (start + span > extent[1]) start = extent[1] - span;
  return { start, end: start + span };
}

/**
 * Zoom di sekitar titik jangkar (`anchor` = posisi 0–1 di dalam lebar grid).
 * `factor` > 1 memperlebar jendela (zoom out), < 1 mempersempit (zoom in).
 */
export function zoomWindow(
  w: ZoomWindow,
  extent: [number, number],
  factor: number,
  anchor: number,
): ZoomWindow {
  const a = Math.min(1, Math.max(0, anchor));
  const span = w.end - w.start;
  const full = extent[1] - extent[0];
  const next = Math.min(full, Math.max(Math.min(MIN_SPAN_MS, full), span * factor));
  const pivot = w.start + span * a;
  return clampWindow({ start: pivot - next * a, end: pivot - next * a + next }, extent);
}

/** Geser jendela sebesar `dxRatio` lebar grid (positif = seret ke kanan → mundur ke masa lalu). */
export function panWindow(
  w: ZoomWindow,
  extent: [number, number],
  dxRatio: number,
  speed = PAN_SPEED,
): ZoomWindow {
  const shift = -dxRatio * (w.end - w.start) * speed;
  return clampWindow({ start: w.start + shift, end: w.end + shift }, extent);
}

/** Delta gulir (WheelEvent) → piksel, dinormalkan dari mode baris/halaman. */
export function wheelPixels(delta: number, deltaMode: number, pageHeight = 800): number {
  const px = deltaMode === 1 ? delta * 16 : deltaMode === 2 ? delta * pageHeight : delta;
  return Math.max(-WHEEL_DELTA_CLAMP, Math.min(WHEEL_DELTA_CLAMP, px));
}

/** Faktor zoom dari gulir vertikal: gulir ke bawah (dy > 0) = zoom out. */
export function wheelZoomFactor(dyPx: number, ctrlKey: boolean): number {
  return Math.exp(dyPx * (ctrlKey ? WHEEL_ZOOM_PER_PX_CTRL : WHEEL_ZOOM_PER_PX));
}
