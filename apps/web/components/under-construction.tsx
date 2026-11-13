/** Kartu penanda halaman yang belum selesai (dipakai selama Fase 3). */
export function UnderConstruction({ task }: { task: string }) {
  return (
    <section className="wrap pb-16">
      <div className="rounded-card border border-line bg-surface p-6">
        <p className="eyebrow m-0 text-2xs tracking-[.12em] text-faint">{task}</p>
        <p className="m-0 mt-2 text-base text-muted">Sedang dibangun.</p>
      </div>
    </section>
  );
}
