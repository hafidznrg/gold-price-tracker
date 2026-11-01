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
    for (const id of key.split('|').filter(Boolean)) {
      fetchSeries(id).then(
        (f) => alive && setFiles((cur) => (cur[id] ? cur : { ...cur, [id]: f })),
        (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
      );
    }
    return () => {
      alive = false;
    };
  }, [key]);
  const loading = key.split('|').some((id) => id && !files[id]);
  return { files, loading: loading && !error, error };
}
