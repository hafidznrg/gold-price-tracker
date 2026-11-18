import { describe, expect, it } from 'vitest';
import { DAY_MS } from './chart-theme';
import {
  clampWindow,
  MIN_SPAN_MS,
  PAN_SPEED,
  panWindow,
  WHEEL_DELTA_CLAMP,
  wheelPixels,
  wheelZoomFactor,
  zoomWindow,
} from './chart-gestures';

const ext: [number, number] = [0, 100 * DAY_MS];
const win = { start: 40 * DAY_MS, end: 60 * DAY_MS };

describe('chart-gestures', () => {
  it('zoom menjaga titik jangkar tetap di tempat', () => {
    const w = zoomWindow(win, ext, 2, 0.5);
    expect(w).toEqual({ start: 30 * DAY_MS, end: 70 * DAY_MS });
    const left = zoomWindow(win, ext, 0.5, 0);
    expect(left.start).toBe(win.start);
    expect(left.end - left.start).toBe(10 * DAY_MS);
  });

  it('zoom dijepit ke lebar minimum dan rentang data', () => {
    const tiny = zoomWindow(win, ext, 0.001, 0.5);
    expect(tiny.end - tiny.start).toBe(MIN_SPAN_MS);
    expect(zoomWindow(win, ext, 100, 0.9)).toEqual({ start: 0, end: 100 * DAY_MS });
  });

  it('geser diredam PAN_SPEED dan tidak keluar dari data', () => {
    const w = panWindow(win, ext, 0.5);
    expect(w.start).toBeCloseTo(win.start - 10 * DAY_MS * PAN_SPEED);
    expect(w.end - w.start).toBe(20 * DAY_MS);
    expect(panWindow(win, ext, 100)).toEqual({ start: 0, end: 20 * DAY_MS });
    expect(panWindow(win, ext, -100)).toEqual({ start: 80 * DAY_MS, end: 100 * DAY_MS });
  });

  it('clampWindow memindahkan jendela yang keluar tanpa memotong lebarnya', () => {
    expect(clampWindow({ start: -5 * DAY_MS, end: 5 * DAY_MS }, ext)).toEqual({
      start: 0,
      end: 10 * DAY_MS,
    });
  });

  it('gulir: delta dinormalkan & dijepit, faktor halus', () => {
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(5000, 0)).toBe(WHEEL_DELTA_CLAMP);
    // Satu takik roda mouse (100 px) jauh lebih halus dari bawaan ECharts (×1,4).
    expect(wheelZoomFactor(100, false)).toBeLessThan(1.15);
    expect(wheelZoomFactor(100, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-100, false)).toBeLessThan(1);
  });
});
