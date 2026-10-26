// Pembacaan HTML tabel tanpa DOM: cukup untuk tabel sederhana sumber ritel (TECH-SPEC §5.1)
// dan JISDOR (§5.5). Dipakai probe dan parser produksi.

/** Teks polos dari potongan HTML: tag dibuang, `&nbsp;` dan spasi berlebih dirapikan. */
export function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sel-sel setiap `<tr>` dalam potongan HTML. */
export function tableRows(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => stripTags(c[1]!)),
  );
}

/** Semua blok `<table …>…</table>` (tabel tidak bersarang). */
export function tables(html: string): string[] {
  return [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/g)].map((m) => m[0]);
}
