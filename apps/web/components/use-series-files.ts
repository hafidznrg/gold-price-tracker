'use client';

import { useEffect, useState } from 'react';
import { fetchSeries, type SeriesFile } from '@/lib/data';

export type SeriesFiles = Record<string, SeriesFile>;

/** Muat file series yang diperlukan (cache di lapisan data); hanya yang belum ada. */
export function useSeriesFiles(ids: string[]): {
  files: SeriesFiles;
  loading: boolean;
  error: string | null;
} {
  const [files, setFiles] = useState<SeriesFiles>({});
  const [error, setError] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    let alive = true;
    // Satu pembaruan state untuk semua file yang baru dimuat → satu render ulang, bukan satu per file.
    const missing = key.split('|').filter(Boolean);
    Promise.all(missing.map((id) => fetchSeries(id).then((f) => [id, f] as const))).then(
      (loaded) => {
        if (!alive) return;
        setFiles((cur) => {
          const next = { ...cur };
          for (const [id, f] of loaded) if (!next[id]) next[id] = f;
          return next;
        });
      },
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const loading = key.split('|').some((id) => id && !files[id]);
  return { files, loading: loading && !error, error };
}
