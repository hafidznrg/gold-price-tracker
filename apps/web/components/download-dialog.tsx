'use client';

import { Download, FileJson, FileSpreadsheet, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { dataUrl } from '@/lib/data/paths';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface DownloadDialogFile {
  /** Nama seri dalam kartu multi-berkas (mis. "Galeri24"); kosong untuk kartu satu berkas. */
  label: string;
  csv: string;
  json: string;
  rows: number;
}

type Format = 'csv' | 'json';

const FORMATS: { id: Format; title: string; hint: string; Icon: typeof FileJson }[] = [
  { id: 'csv', title: 'CSV', hint: 'Untuk Excel atau Google Sheets', Icon: FileSpreadsheet },
  { id: 'json', title: 'JSON', hint: 'Untuk program atau skrip', Icon: FileJson },
];

const fileName = (path: string) => path.split('/').pop() ?? path;

/**
 * Tombol "Unduh data" + pop-up konfirmasi. Klik tombol tidak langsung mengunduh: pengguna memilih
 * seri (bila kartu punya beberapa berkas) dan format, melihat nama berkas, lalu menekan "Unduh".
 * Memakai `<dialog>` bawaan (fokus terkunci, Escape menutup); di HP tampil sebagai lembar bawah.
 */
export function DownloadDialog({
  title,
  files,
  range,
}: {
  title: string;
  files: DownloadDialogFile[];
  /** "4 Jan 2010 – 14 Nov 2026". */
  range: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [fileIdx, setFileIdx] = useState(0);
  const [format, setFormat] = useState<Format>('csv');
  const titleId = useId();
  const groupName = useId();

  if (files.length === 0) return null;
  const file = files[fileIdx] ?? files[0]!;
  const path = format === 'csv' ? file.csv : file.json;

  const open = () => {
    // Lebar scrollbar diukur sebelum scroll dikunci, untuk kompensasi padding (globals.css).
    const root = document.documentElement;
    root.style.setProperty('--scrollbar-w', `${window.innerWidth - root.clientWidth}px`);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={open}
        aria-haspopup="dialog"
        aria-label={`Unduh data ${title}`}
        className="w-full"
      >
        <Download className="size-4" aria-hidden="true" />
        Unduh data
      </Button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        // Klik di luar panel (pada backdrop) menutup pop-up.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className={cn(
          'download-dialog m-auto max-h-[calc(100dvh-32px)] w-[min(460px,calc(100vw-48px))] max-w-none overflow-y-auto rounded-card-sm border border-line bg-surface p-0 text-text shadow-2xl backdrop:bg-black/55',
          // HP: lembar dari bawah layar, selebar layar.
          'max-sm:mb-0 max-sm:max-h-[calc(100dvh-48px)] max-sm:w-full max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0',
        )}
      >
        <div className="flex flex-col gap-5 p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted">Unduh data</div>
              <h2 id={titleId} className="m-0 mt-0.5 text-lg font-semibold">
                {title}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Tutup"
              className="-mr-2 -mt-2 flex-none"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>

          {files.length > 1 ? (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-semibold">Seri</legend>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2">
                {files.map((f, i) => (
                  <label
                    key={f.csv}
                    className={cn(
                      'flex min-h-11 cursor-pointer flex-col justify-center rounded-field border px-3 py-2 transition-colors',
                      i === fileIdx ? 'border-gold bg-goldsoft' : 'border-line hover:bg-surface2',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${groupName}-file`}
                      checked={i === fileIdx}
                      onChange={() => setFileIdx(i)}
                      className="sr-only"
                    />
                    <span className="text-sm font-semibold">{f.label}</span>
                    <span className="num text-xs text-muted">{formatNumber(f.rows)} baris</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-sm font-semibold">Format</legend>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(({ id, title: t, hint, Icon }) => (
                <label
                  key={id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-field border p-3 transition-colors',
                    format === id ? 'border-gold bg-goldsoft' : 'border-line hover:bg-surface2',
                  )}
                >
                  <input
                    type="radio"
                    name={`${groupName}-format`}
                    checked={format === id}
                    onChange={() => setFormat(id)}
                    className="sr-only"
                  />
                  <Icon
                    className={cn(
                      'mt-0.5 size-5 flex-none',
                      format === id ? 'text-gold' : 'text-muted',
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold">{t}</span>
                    <span className="text-xs leading-snug text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1 rounded-field bg-surface2 px-3.5 py-3">
            <span className="text-xs text-muted">Berkas yang akan diunduh</span>
            <span className="break-all font-mono text-sm font-semibold">{fileName(path)}</span>
            <span className="num text-xs text-muted">
              {formatNumber(file.rows)} baris · {range}
            </span>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close} className="sm:min-w-28">
              Batal
            </Button>
            <a
              href={dataUrl(path)}
              download
              onClick={close}
              className={cn(buttonVariants(), 'sm:min-w-28')}
            >
              <Download className="size-4" aria-hidden="true" />
              Unduh {format.toUpperCase()}
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
