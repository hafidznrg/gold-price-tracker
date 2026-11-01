export interface BarItem {
  label: string;
  value: number | null;
  /** Warna batang (token/warna); menimpa warna default. */
  color?: string;
  /** Sorot (mis. 1 g) — memakai --gold seperti mockup. */
  highlight?: boolean;
}

/** Rasio panjang batang 0–1 terhadap `max` (default nilai terbesar). Nilai kosong/negatif → 0. */
export function barLayout(items: BarItem[], max?: number): { item: BarItem; ratio: number }[] {
  const top =
    max ??
    items.reduce(
      (m, it) => (it.value !== null && Number.isFinite(it.value) && it.value > m ? it.value : m),
      0,
    );
  return items.map((item) => {
    const v = item.value;
    const ratio =
      v === null || !Number.isFinite(v) || v <= 0 || top <= 0 ? 0 : Math.min(1, v / top);
    return { item, ratio };
  });
}
