/** Path SVG murni untuk <Sparkline> (setara helper `line`/`band`/`spark` di mockup). */

export type SparkValues = readonly (number | null | undefined)[];
export type Trend = 'up' | 'down' | 'flat';

const ok = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Min–maks semua nilai valid, diberi bantalan `pad` (default 8%) seperti mockup. */
export function sparkExtent(arrays: SparkValues[], pad = 0.08): [number, number] | null {
  let mn = Infinity;
  let mx = -Infinity;
  for (const a of arrays)
    for (const v of a)
      if (ok(v)) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
  if (mn === Infinity) return null;
  const p = (mx - mn) * pad || Math.abs(mx) * 0.01 || 1;
  return [mn - p, mx + p];
}

const x = (i: number, n: number, w: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
const y = (v: number, [mn, mx]: [number, number], h: number) => h - ((v - mn) / (mx - mn)) * h;
const f = (n: number) => n.toFixed(1);

/** Garis dengan pena diangkat di nilai kosong (tidak menyambung celah). */
export function sparkLine(
  values: SparkValues,
  ext: [number, number],
  w: number,
  h: number,
): string {
  let d = '';
  let pen = false;
  const n = values.length;
  values.forEach((v, i) => {
    if (!ok(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${f(x(i, n, w))} ${f(y(v, ext, h))} `;
    pen = true;
  });
  return d.trim();
}

/** Area tertutup di antara dua deret, satu poligon per ruas yang keduanya terisi. */
export function sparkBand(
  upper: SparkValues,
  lower: SparkValues,
  ext: [number, number],
  w: number,
  h: number,
): string {
  const n = Math.max(upper.length, lower.length);
  const parts: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) {
      let d = run
        .map((i, k) => `${k ? 'L' : 'M'}${f(x(i, n, w))} ${f(y(upper[i] as number, ext, h))}`)
        .join(' ');
      for (const i of [...run].reverse())
        d += ` L${f(x(i, n, w))} ${f(y(lower[i] as number, ext, h))}`;
      parts.push(d + ' Z');
    }
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (ok(upper[i]) && ok(lower[i])) run.push(i);
    else flush();
  }
  flush();
  return parts.join(' ');
}

/** Arah dari nilai valid pertama ke terakhir. */
export function sparkTrend(values: SparkValues): Trend {
  const valid = values.filter(ok);
  if (valid.length < 2) return 'flat';
  const d = (valid.at(-1) ?? 0) - (valid[0] ?? 0);
  return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
}

export const TREND_TOKEN: Record<Trend, string> = { up: 'up', down: 'down', flat: 'muted' };
