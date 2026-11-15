'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { SourceStamp } from '@/components/source-stamp';
import { useSeriesFiles } from '@/components/use-series-files';
import { COMPARE_DEFS, findOption, type CompareDef } from '@/lib/bandingkan';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import { seriesPoints, type ExplorerOption } from '@/lib/explorer';
import {
  breakEven,
  caretAfterDigits,
  digitsBeforeCaret,
  buyDefs,
  buyQuote,
  chartModel,
  daysBetween,
  decodeState,
  defById,
  encodeState,
  formatHold,
  latestPoint,
  MAX_PAID,
  MAX_QTY,
  normalizeState,
  outcome,
  paidDiff,
  paidPerPiece,
  parseCustomWeight,
  supportsCustomWeight,
  CUSTOM_WEIGHT_MAX,
  CUSTOM_WEIGHT_MIN,
  piecePoints,
  sellOption,
  nearestPairableWeight,
  pairableWeights,
  sellChoices,
  weightsFor,
  CALCULATOR_TOLERANCE_DAYS,
  type BuyQuote,
  type CalcState,
} from '@/lib/kalkulator';
import {
  changeDirection,
  EMPTY,
  formatChangeRupiah,
  formatDate,
  formatNumber,
  formatPct,
  formatRupiah,
  formatWeight,
} from '@/lib/format';
import { cn } from '@/lib/utils';

export interface KalkulatorBoardProps {
  /** Opsi katalog hanya untuk enam sumber yang dipakai (`compareOptions`). */
  options: ExplorerOption[];
  /** Tanggal data terbaru. */
  asOf: string;
  calendar: DataCalendar;
}

const FIELD =
  'h-10 w-full rounded-field border border-line bg-surface2 px-3 text-sm text-text disabled:cursor-not-allowed disabled:text-muted';
const PANEL = 'min-w-0 rounded-card border border-line bg-surface p-5 max-sm:p-4';
const STEP_BTN =
  'size-10 flex-none cursor-pointer rounded-field border border-line bg-surface2 text-lg text-text disabled:cursor-not-allowed disabled:opacity-50';

const CUSTOM_W = '__custom';
const LINK_BTN = 'cursor-pointer border-0 bg-transparent p-0 text-xs text-gold underline';

const sourceLabel = (d: CompareDef) => `${d.sourceName} · ${d.brandName}`;
const unitWord = (d: CompareDef) => (d.linear ? 'porsi' : 'keping');

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-10 text-center text-sm text-muted">{children}</p>;
}

/** Penjelasan kenapa harga beli tidak ditemukan, beserta saran tanggal. */
function missingText(q: Extract<BuyQuote, { ok: false }>, label: string, date: string): string {
  const tol = CALCULATOR_TOLERANCE_DAYS;
  if (q.reason === 'empty') return `Belum ada data harga jual ${label}.`;
  if (q.reason === 'before') {
    return `Tidak ada data harga jual ${label} pada ${formatDate(date)}. Data paling awal: ${formatDate(q.first!)}.`;
  }
  return `Tidak ada data harga jual ${label} dalam ${tol} hari sampai ${formatDate(date)}. Data terdekat sebelumnya: ${formatDate(q.suggest!)}.`;
}

export function KalkulatorBoard({ options, asOf, calendar }: KalkulatorBoardProps) {
  const [query, setQuery] = useQueryStates(
    {
      d: parseAsString,
      b: parseAsString,
      w: parseAsString,
      q: parseAsString,
      s: parseAsString,
      p: parseAsString,
    },
    { history: 'replace' },
  );
  const ctx = useMemo(() => ({ options, asOf }), [options, asOf]);
  const state = useMemo(() => decodeState(query, ctx), [query, ctx]);

  const commit = useCallback(
    (patch: Partial<CalcState>) =>
      void setQuery(encodeState(normalizeState({ ...state, ...patch }, ctx), ctx)),
    [setQuery, state, ctx],
  );

  // Isian jumlah: teks lokal supaya bisa dikosongkan sebentar saat mengetik.
  const [qtyText, setQtyText] = useState(String(state.qty));
  useEffect(() => setQtyText(String(state.qty)), [state.qty]);

  // Berat lain (D-61): input angka lokal supaya bisa diketik bertahap ("1." → "1.5").
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState(String(state.w));
  useEffect(() => setCustomText((t) => (Number(t) === state.w ? t : String(state.w))), [state.w]);
  // Total harga beli: draf teks saat mengetik; null = tampilkan nilai dari keadaan.
  const [paidDraft, setPaidDraft] = useState<string | null>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  // Jumlah digit sebelum kursor saat mengetik; dipulihkan setelah teks diformat ulang.
  const paidCaret = useRef<number | null>(null);
  // Memicu pemulihan kursor juga saat teks tidak berubah (mis. huruf atau angka di atas batas ditolak).
  const [caretTick, setCaretTick] = useState(0);

  const buys = useMemo(() => buyDefs(options), [options]);
  const buyDef = defById(state.buyId) ?? COMPARE_DEFS[0]!;
  const weights = useMemo(() => weightsFor(buyDef, options), [buyDef, options]);
  // "Dijual ke" hanya berisi tempat yang benar-benar punya buyback untuk berat ini.
  const choices = useMemo(() => sellChoices(buyDef, state.w, options), [buyDef, state.w, options]);
  const pairable = useMemo(() => pairableWeights(buyDef, options), [buyDef, options]);
  const nearestW = useMemo(
    () => (pairable.includes(state.w) ? null : nearestPairableWeight(buyDef, state.w, options)),
    [pairable, buyDef, state.w, options],
  );
  const sellDef = defById(state.sellId);
  const canCustom = supportsCustomWeight(buyDef);
  const customActive = canCustom && (customMode || !weights.includes(state.w));

  const buyOpt = findOption(buyDef, state.w, options);
  const sell = sellDef ? sellOption(sellDef, state.w, options) : null;
  const sellOpt = sell?.option ?? null;

  const needed = useMemo(
    () => [
      ...new Set([
        ...(buyOpt ? [buyOpt.file] : []),
        ...choices.flatMap((d) => {
          const o = sellOption(d, state.w, options);
          return o ? [o.option.file] : [];
        }),
      ]),
    ],
    [buyOpt, choices, state.w, options],
  );
  const { files, loading, error } = useSeriesFiles(needed);

  /** Harga per keping satu sumber (jual atau buyback); null bila file belum dimuat / tak ada. */
  const piecesOf = useCallback(
    (d: CompareDef, price: 'sell' | 'buyback') => {
      if (price === 'buyback') {
        // Buyback per gram (D-39): titik 1 g dikali berat, sama seperti Tabungan Emas.
        const sell = sellOption(d, state.w, options);
        const f = sell ? files[sell.option.file] : undefined;
        return sell && f
          ? piecePoints(seriesPoints(f, sell.option, 'buyback'), sell.perGram || d.linear, state.w)
          : null;
      }
      const o = findOption(d, state.w, options);
      const f = o ? files[o.file] : undefined;
      return o && f ? piecePoints(seriesPoints(f, o, price), d.linear, state.w) : null;
    },
    [files, options, state.w],
  );

  const buyPoints = useMemo(
    () => (loading ? null : piecesOf(buyDef, 'sell')),
    [loading, piecesOf, buyDef],
  );
  const sellPoints = useMemo(
    () => (loading || !sellDef ? null : piecesOf(sellDef, 'buyback')),
    [loading, piecesOf, sellDef],
  );

  const quote = useMemo(
    () => (buyPoints ? buyQuote(buyPoints, state.date) : null),
    [buyPoints, state.date],
  );
  const sellNow = useMemo(() => (sellPoints ? latestPoint(sellPoints) : null), [sellPoints]);

  const official = quote?.ok ? quote : null;
  // Harga beli yang dipakai: total yang diisi ÷ jumlah bila diubah, selain itu harga resmi (D-61).
  const buyEff = useMemo(
    () =>
      state.paid !== null
        ? { date: state.date, price: paidPerPiece(state.paid, state.qty) }
        : official
          ? { date: official.date, price: official.price }
          : null,
    [state.paid, state.qty, state.date, official],
  );

  const result = useMemo(() => {
    if (!buyEff || !sellNow || sellNow.date < buyEff.date || !sellPoints) return null;
    const o = outcome(buyEff, { date: sellNow.date, price: sellNow.value }, state.qty);
    return { o, be: breakEven(sellPoints, state.date, o.buyPrice) };
  }, [buyEff, sellNow, sellPoints, state.qty, state.date]);

  const diff = useMemo(
    () => (state.paid !== null ? paidDiff(state.paid, state.qty, official?.price) : null),
    [state.paid, state.qty, official],
  );
  const officialTotal = official ? Math.round(official.price * state.qty) : null;
  const paidShown =
    paidDraft ??
    (state.paid !== null
      ? formatNumber(state.paid)
      : officialTotal
        ? formatNumber(officialTotal)
        : '');
  const needPaid = !loading && !error && state.paid === null && !official;

  // Pulihkan kursor setelah titik ribuan ditulis ulang (tanpa ini kursor lompat ke akhir).
  useLayoutEffect(() => {
    const el = paidRef.current;
    const n = paidCaret.current;
    if (!el || n === null || document.activeElement !== el) return;
    paidCaret.current = null;
    const pos = caretAfterDigits(el.value, n);
    el.setSelectionRange(pos, pos);
  }, [paidShown, caretTick]);

  const chart = useMemo(
    () =>
      result && sellPoints && sellDef
        ? chartModel(
            sellPoints,
            state.qty,
            state.date,
            result.o.modal,
            expectedFor(calendar, [sellDef.source]),
          )
        : null,
    [result, sellPoints, sellDef, state.qty, state.date, calendar],
  );

  const series: TimeSeries[] = useMemo(() => {
    if (!chart || chart.value.length === 0) return [];
    return [
      {
        id: 'value',
        label: 'Nilai jual (buyback)',
        color: sellDef?.color ?? 'spot',
        width: 2.4,
        points: chart.value,
      },
      {
        id: 'modal',
        label: 'Modal',
        color: 'muted',
        dashed: true,
        width: 1.6,
        points: chart.modal,
      },
    ];
  }, [chart, sellDef]);

  const events = useMemo(() => {
    if (!result) return [];
    const ev = [{ date: result.o.buyDate, label: `Beli ${formatDate(result.o.buyDate)}` }];
    if (result.be.reached && result.be.since && !result.be.truncated) {
      ev.push({ date: result.be.since, label: `Impas ${formatDate(result.be.since)}` });
    }
    return ev;
  }, [result]);
  const gaps = useMemo(() => labelGaps(chart?.gaps ?? []), [chart]);

  const stepQty = (delta: number) =>
    commit({ qty: Math.max(1, Math.min(MAX_QTY, state.qty + delta)) });
  const unit = unitWord(buyDef);
  const wText = formatWeight(state.w);
  const buyLabel = `${sourceLabel(buyDef)} ${wText}`;
  const isLm = buyDef.source === 'logammulia';

  const o = result?.o;
  const dir = changeDirection(o?.profit);
  const tone = dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-text';
  const headline = dir === 'up' ? 'Untung' : dir === 'down' ? 'Rugi' : 'Impas';

  const ready = !loading && !error;
  let status: React.ReactNode = null;
  if (error) status = 'Data gagal dimuat. Muat ulang halaman.';
  else if (loading) status = 'Memuat data…';
  else if (!sellDef) {
    status = nearestW
      ? `Belum ada data buyback untuk ${buyLabel}, jadi untung/rugi tidak bisa dihitung. Pilih gramasi lain, misalnya ${formatWeight(nearestW)}.`
      : `Belum ada data buyback untuk emas ${buyDef.brandName}, jadi untung/rugi tidak bisa dihitung. Pilih tempat beli lain.`;
  } else if (needPaid && !buyOpt)
    status = `${buyLabel} tidak punya harga resmi di data. Isi total harga beli untuk menghitung.`;
  else if (needPaid && quote && !quote.ok)
    status = `${missingText(quote, buyLabel, state.date)} Atau isi total harga beli.`;
  else if (buyEff && !sellNow) status = `Belum ada data buyback ${sourceLabel(sellDef)} ${wText}.`;
  else if (buyEff && sellNow && !result) {
    status = `Data buyback terakhir (${formatDate(sellNow.date)}) lebih awal dari tanggal harga beli (${formatDate(buyEff.date)}).`;
  }

  return (
    <>
      <section className="wrap flex flex-wrap items-stretch gap-[22px] pb-[22px]">
        <form
          aria-label="Data pembelian"
          onSubmit={(e) => e.preventDefault()}
          className={cn(
            PANEL,
            'flex flex-[1_1_340px] flex-col gap-3 rounded-[22px] p-5 max-sm:p-4',
          )}
        >
          <h2 className="m-0 text-base font-semibold">Pembelian</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="kalk-date" className="text-xs text-muted">
                Tanggal beli
              </label>
              <input
                id="kalk-date"
                type="date"
                className={FIELD}
                value={state.date}
                max={asOf}
                onChange={(e) => e.target.value && commit({ date: e.target.value })}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="kalk-buy" className="text-xs text-muted">
                Dibeli di
              </label>
              <select
                id="kalk-buy"
                className={FIELD}
                value={buyDef.id}
                onChange={(e) => commit({ buyId: e.target.value })}
              >
                {buys.map((d) => (
                  <option key={d.id} value={d.id}>
                    {sourceLabel(d)}
                    {pairableWeights(d, options).length === 0 ? ' · tanpa buyback' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="kalk-w" className="text-xs text-muted">
                Gramasi
              </label>
              <select
                id="kalk-w"
                className={FIELD}
                value={customActive ? CUSTOM_W : String(state.w)}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_W) {
                    setCustomMode(true);
                    setCustomText(String(state.w));
                    return;
                  }
                  setCustomMode(false);
                  commit({ w: Number(e.target.value) });
                }}
              >
                {weights.map((w) => (
                  <option key={w} value={String(w)}>
                    {formatWeight(w)}
                    {pairable.length > 0 && !pairable.includes(w) ? ' · tanpa buyback' : ''}
                  </option>
                ))}
                {canCustom ? <option value={CUSTOM_W}>Berat lain…</option> : null}
              </select>
              {customActive ? (
                <div className="flex items-center gap-1.5">
                  <input
                    id="kalk-w-custom"
                    type="number"
                    inputMode="decimal"
                    aria-label="Berat lain (gram)"
                    min={CUSTOM_WEIGHT_MIN}
                    max={CUSTOM_WEIGHT_MAX}
                    step={0.01}
                    className={cn(FIELD, 'num min-w-0')}
                    value={customText}
                    onChange={(e) => {
                      setCustomText(e.target.value);
                      const w = parseCustomWeight(
                        e.target.value === '' ? null : Number(e.target.value),
                      );
                      if (w !== null) commit({ w });
                    }}
                    onBlur={() => setCustomText(String(state.w))}
                  />
                  <span className="text-xs text-muted">gram</span>
                </div>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="kalk-qty" className="text-xs text-muted">
                Jumlah {unit}
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className={STEP_BTN}
                  aria-label={`Kurangi ${unit}`}
                  disabled={state.qty <= 1}
                  onClick={() => stepQty(-1)}
                >
                  −
                </button>
                <input
                  id="kalk-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QTY}
                  step={1}
                  className={cn(FIELD, 'num min-w-0 px-1 text-center')}
                  value={qtyText}
                  onChange={(e) => {
                    setQtyText(e.target.value);
                    const n = Number(e.target.value);
                    if (e.target.value !== '' && Number.isInteger(n) && n >= 1) commit({ qty: n });
                  }}
                  onBlur={() => setQtyText(String(state.qty))}
                />
                <button
                  type="button"
                  className={STEP_BTN}
                  aria-label={`Tambah ${unit}`}
                  disabled={state.qty >= MAX_QTY}
                  onClick={() => stepQty(1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <label htmlFor="kalk-paid" className="text-xs text-muted">
                Total harga beli (Rp)
                {state.paid !== null && official ? (
                  <span className="ml-1.5 rounded-full bg-surface2 px-1.5 py-0.5 text-[11px] text-gold">
                    diubah
                  </span>
                ) : null}
              </label>
              {state.paid !== null && official ? (
                <button
                  type="button"
                  className={LINK_BTN}
                  onClick={() => {
                    setPaidDraft(null);
                    commit({ paid: null });
                  }}
                >
                  Kembalikan ke harga resmi
                </button>
              ) : null}
            </div>
            <input
              id="kalk-paid"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={needPaid ? 'Isi total harga beli' : undefined}
              aria-required={needPaid || undefined}
              aria-describedby="kalk-paid-note"
              className={cn(FIELD, 'num')}
              ref={paidRef}
              value={paidShown}
              onKeyDown={(e) => {
                // Backspace/Delete pada titik pemisah: lompati titiknya, hapus digit di sebelahnya.
                const el = e.currentTarget;
                const s = el.selectionStart;
                if (s === null || s !== el.selectionEnd) return;
                if (e.key === 'Backspace' && s > 0 && el.value[s - 1] === '.') {
                  el.setSelectionRange(s - 1, s - 1);
                } else if (e.key === 'Delete' && el.value[s] === '.') {
                  el.setSelectionRange(s + 1, s + 1);
                }
              }}
              onChange={(e) => {
                const el = e.target;
                paidCaret.current = digitsBeforeCaret(
                  el.value,
                  el.selectionStart ?? el.value.length,
                );
                setCaretTick((x) => x + 1);
                const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
                if (digits === '') {
                  setPaidDraft('');
                  commit({ paid: null });
                  return;
                }
                const n = Number(digits);
                if (!Number.isSafeInteger(n) || n > MAX_PAID) {
                  // Ditolak: kursor kembali ke posisi sebelum ketikan.
                  paidCaret.current = Math.max(0, (paidCaret.current ?? 0) - 1);
                  return;
                }
                setPaidDraft(formatNumber(n));
                commit({ paid: n });
              }}
              onBlur={() => setPaidDraft(null)}
            />
            <p id="kalk-paid-note" className="m-0 text-xs leading-relaxed text-muted">
              {official
                ? `Harga resmi ${sourceLabel(buyDef)}, ${formatDate(official.date)}. Ubah bila Anda membayar berbeda.`
                : ready
                  ? 'Tidak ada harga resmi untuk berat dan tanggal ini. Isi total harga beli yang Anda bayar.'
                  : 'Memuat harga resmi…'}{' '}
              Khusus emas batangan 24K merek yang dilacak (bukan perhiasan), tanpa potongan tempat
              buyback. Nominal yang diubah ikut tersimpan di tautan.
            </p>
          </div>
          <div
            className="rounded-[12px] bg-surface2 px-3.5 py-2.5 text-sm leading-[1.5] text-muted"
            aria-live="polite"
          >
            {!ready ? (
              'Memuat harga beli…'
            ) : state.paid !== null && buyEff ? (
              <>
                Harga beli: <b className="num text-text">{formatRupiah(buyEff.price)}</b> per {unit}{' '}
                (total <span className="num">{formatRupiah(state.paid)}</span> ÷{' '}
                {formatNumber(state.qty)}), sesuai isian Anda.
              </>
            ) : quote?.ok ? (
              <>
                Harga beli: <b className="num text-text">{formatRupiah(quote.price)}</b> per {unit}
                {buyDef.linear ? ` (${wText}, dari harga per gram × berat)` : ''}
                {isLm ? ' (harga dasar Logam Mulia, belum termasuk PPh 0,25%)' : ''}, dari data{' '}
                <b className="num text-text">{formatDate(quote.date)}</b>
                {quote.daysOff > 0 ? ` (${quote.daysOff} hari sebelum tanggal beli)` : ''}: nilai
                terakhir ≤ tanggal beli, toleransi {CALCULATOR_TOLERANCE_DAYS} hari.
              </>
            ) : quote ? (
              <>
                {missingText(quote, buyLabel, state.date)}
                {quote.suggest ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => commit({ date: quote.suggest! })}
                      className="cursor-pointer border-0 bg-transparent p-0 text-sm text-gold underline"
                    >
                      Pakai {formatDate(quote.suggest)}
                    </button>{' '}
                    atau isi total harga beli.
                  </>
                ) : (
                  ' Isi total harga beli.'
                )}
              </>
            ) : needPaid ? (
              `${buyLabel} tidak punya harga resmi. Isi total harga beli di atas.`
            ) : (
              EMPTY
            )}
          </div>
          <div className="h-px bg-line" />
          <h2 className="m-0 text-base font-semibold">Penjualan kembali</h2>
          <div className="flex flex-col gap-1">
            <label htmlFor="kalk-sell" className="text-xs text-muted">
              Dijual ke (buyback)
            </label>
            <select
              id="kalk-sell"
              className={FIELD}
              value={sellDef?.id ?? ''}
              disabled={!sellDef}
              aria-describedby={sellDef ? undefined : 'kalk-sell-note'}
              onChange={(e) => commit({ sellId: e.target.value })}
            >
              {sellDef ? null : <option value="">Belum ada data buyback</option>}
              {choices.map((d) => {
                const p = piecesOf(d, 'buyback');
                const last = p ? latestPoint(p) : null;
                return (
                  <option key={d.id} value={d.id}>
                    {sourceLabel(d)}
                    {last ? ` · ${formatRupiah(last.value)}${d.linear ? `/${wText}` : ''}` : ''}
                  </option>
                );
              })}
            </select>
            {sellDef ? null : (
              <p id="kalk-sell-note" className="m-0 mt-1 text-xs leading-relaxed text-muted">
                {nearestW ? (
                  <>
                    Buyback {buyDef.brandName} tidak tersedia untuk {wText}.{' '}
                    <button
                      type="button"
                      onClick={() => commit({ w: nearestW })}
                      className="cursor-pointer border-0 bg-transparent p-0 text-xs text-gold underline"
                    >
                      Pakai {formatWeight(nearestW)}
                    </button>
                  </>
                ) : (
                  `Belum ada sumber buyback untuk emas ${buyDef.brandName}. Harga beli tetap ditampilkan di atas.`
                )}
              </p>
            )}
          </div>
        </form>

        <div
          className={cn(
            PANEL,
            'flex flex-[1.4_1_460px] flex-col gap-3.5 rounded-[22px] p-5 max-sm:p-4',
          )}
        >
          {o && result ? (
            <>
              <div>
                <div className="eyebrow text-faint">{headline} jika dijual hari ini</div>
                <div
                  className={cn(
                    'num serif mt-2 text-[60px] leading-none break-words max-sm:text-[44px]',
                    tone,
                  )}
                  data-testid="kalk-profit"
                >
                  {formatChangeRupiah(o.profit)}
                </div>
                <div className={cn('num mt-2.5 text-base font-semibold', tone)}>
                  {formatPct(o.profitPct)}{' '}
                  <span className="font-normal text-muted">
                    dalam {formatHold(o.holdDays)}
                    {o.cagr !== null ? ` · setara ${formatPct(o.cagr * 100, 1)} per tahun` : ''}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px overflow-hidden rounded-[16px] border border-line bg-line">
                <div className="bg-surface p-3.5">
                  <div className="text-xs text-faint">Modal</div>
                  <div className="num mt-1.5 text-xl font-semibold">{formatRupiah(o.modal)}</div>
                  <div className="num mt-1 text-xs text-muted">
                    {formatNumber(o.qty)} × {formatRupiah(o.buyPrice)}
                  </div>
                </div>
                <div className="bg-surface p-3.5">
                  <div className="text-xs text-faint">Nilai jual hari ini</div>
                  <div className="num mt-1.5 text-xl font-semibold">{formatRupiah(o.value)}</div>
                  <div className="num mt-1 text-xs text-muted">
                    {formatNumber(o.qty)} × {formatRupiah(o.sellPrice)}
                  </div>
                </div>
                <div className="bg-surface p-3.5">
                  <div className="text-xs text-faint">
                    {result.be.reached ? 'Titik impas tercapai' : 'Titik impas'}
                  </div>
                  <div className="num mt-1.5 text-xl font-semibold">
                    {result.be.reached
                      ? result.be.truncated && result.be.since === result.be.firstDate
                        ? `≤ ${formatDate(result.be.since!)}`
                        : formatDate(result.be.since!)
                      : 'Belum tercapai'}
                  </div>
                  <div className="num mt-1 text-xs text-muted">
                    {result.be.reached
                      ? `buyback ≥ ${formatRupiah(result.be.price)} per ${unit} sejak itu`
                      : `butuh buyback ${formatRupiah(result.be.price)} per ${unit} (${formatPct(o.breakEvenGapPct)} dari sekarang)`}
                  </div>
                </div>
              </div>
              {diff ? (
                <p className="num m-0 text-sm text-muted" data-testid="kalk-diff">
                  {Math.abs(diff.pct) < 0.05
                    ? 'Sama dengan harga resmi'
                    : `${formatNumber(Math.abs(diff.pct), 1)}% ${diff.pct > 0 ? 'di atas' : 'di bawah'} harga resmi`}{' '}
                  ({formatRupiah(diff.officialTotal)}).
                  {diff.warn ? (
                    <b className="ml-1 text-text" role="note">
                      Periksa lagi nominalnya.
                    </b>
                  ) : null}
                </p>
              ) : null}
              {!result.be.reached && result.be.lastAbove ? (
                <p className="num m-0 text-xs text-muted">
                  Terakhir buyback di atas harga beli: {formatDate(result.be.lastAbove)}.
                </p>
              ) : null}
              {result.be.truncated && result.be.firstDate ? (
                <p className="m-0 text-xs text-muted" role="note">
                  Data buyback {sellDef ? sourceLabel(sellDef) : ''} baru ada sejak{' '}
                  {formatDate(result.be.firstDate)}; titik impas dan grafik sebelum tanggal itu
                  tidak diketahui.
                </p>
              ) : null}
              {sellNow &&
              sellNow.date < asOf &&
              daysBetween(sellNow.date, asOf) > CALCULATOR_TOLERANCE_DAYS ? (
                <p className="num m-0 text-xs text-muted" role="note">
                  Buyback terbaru yang tercatat bertanggal {formatDate(sellNow.date)}.
                </p>
              ) : null}
              {sellDef ? (
                <SourceStamp source={sellDef.source} date={sellNow?.date ?? asOf}>
                  buyback {sourceLabel(sellDef)}
                  {sell?.perGram
                    ? ` · harga buyback per gram (baris 1 g) × ${formatWeight(state.w)}, berlaku untuk semua ukuran keping`
                    : ''}
                </SourceStamp>
              ) : null}
            </>
          ) : (
            <div>
              <div className="eyebrow text-faint">Untung/rugi jika dijual hari ini</div>
              <div className="num serif mt-2 text-[60px] leading-none text-faint max-sm:text-[44px]">
                {EMPTY}
              </div>
              <p className="m-0 mt-3 text-sm leading-relaxed text-muted" role="status">
                {status ?? 'Lengkapi data pembelian.'}
              </p>
            </div>
          )}
          <p className="m-0 text-xs leading-[1.6] text-muted">
            Belum memperhitungkan PPh 22 yang dapat dipotong saat menjual kembali
            {isLm ? ' dan PPh 0,25% pada pembelian Logam Mulia (harga dasar)' : ''}. Hitungan ini
            bukan rekomendasi investasi.
          </p>
        </div>
      </section>

      <section className="wrap pb-16">
        <div className={cn(PANEL, 'rounded-[22px]')}>
          <h2 className="m-0 text-xl font-semibold max-sm:text-lg">
            Nilai jual sejak tanggal beli
          </h2>
          <p className="num m-0 mt-1.5 mb-3 text-sm text-muted">
            {buyLabel}
            {sellDef ? ` · dijual ke ${sourceLabel(sellDef)}` : ''}
            {chart?.first && chart.last
              ? ` · ${formatDate(chart.first)} – ${formatDate(chart.last)}`
              : ''}
            {' · '}
            {formatNumber(state.qty)} {unit}
          </p>
          {error ? (
            <Hint>Data gagal dimuat. Muat ulang halaman.</Hint>
          ) : loading ? (
            <Hint>Memuat data…</Hint>
          ) : series.length === 0 ? (
            <Hint>
              {result === null
                ? 'Grafik tampil setelah harga beli dan buyback tersedia.'
                : 'Tidak ada data buyback sejak tanggal beli.'}
            </Hint>
          ) : (
            <TimeSeriesChart
              series={series}
              valueFormat="rupiah"
              gaps={gaps}
              events={events}
              height={340}
              ariaLabel={`Nilai jual ${formatNumber(state.qty)} ${unit} ${buyLabel} sejak ${formatDate(state.date)} dibandingkan modal`}
            />
          )}
          {sellOpt && sellOpt.first.buyback && !loading ? (
            <p className="m-0 mt-3 text-xs text-faint" role="note">
              Garis hanya digambar di tanggal ada buyback (data {sourceLabel(sellDef!)} mulai{' '}
              {formatDate(sellOpt.first.buyback)}); hari tanpa data berupa celah, bukan garis
              tersambung.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
