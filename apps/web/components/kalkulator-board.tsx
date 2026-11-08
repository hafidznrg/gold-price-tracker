'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TimeSeriesChart, type TimeSeries } from '@/components/charts/time-series-chart';
import { SourceStamp } from '@/components/source-stamp';
import { useSeriesFiles } from '@/components/use-series-files';
import { COMPARE_DEFS, findOption, type CompareDef } from '@/lib/bandingkan';
import { expectedFor, labelGaps, type DataCalendar } from '@/lib/calendar';
import { seriesPoints, type ExplorerOption } from '@/lib/explorer';
import {
  breakEven,
  buyDefs,
  buyQuote,
  chartModel,
  daysBetween,
  decodeState,
  defById,
  encodeState,
  formatHold,
  latestPoint,
  MAX_QTY,
  normalizeState,
  outcome,
  piecePoints,
  sellAvailable,
  sellOption,
  sellCandidates,
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

const FIELD = 'h-11 w-full rounded-field border border-line bg-surface2 px-3 text-sm text-text';
const PANEL = 'min-w-0 rounded-card border border-line bg-surface p-6 max-sm:p-4';
const STEP_BTN =
  'size-11 flex-none cursor-pointer rounded-field border border-line bg-surface2 text-lg text-text disabled:cursor-not-allowed disabled:opacity-50';

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

  const buys = useMemo(() => buyDefs(options), [options]);
  const buyDef = defById(state.buyId) ?? COMPARE_DEFS[0]!;
  const weights = useMemo(() => weightsFor(buyDef, options), [buyDef, options]);
  const candidates = useMemo(
    () =>
      sellCandidates(buyDef).map((d) => ({
        d,
        ok: sellAvailable(d, state.w, options),
      })),
    [buyDef, state.w, options],
  );
  const sellDef = defById(state.sellId);

  const buyOpt = findOption(buyDef, state.w, options);
  const sell = sellDef ? sellOption(sellDef, state.w, options) : null;
  const sellOpt = sell?.option ?? null;

  const needed = useMemo(
    () => [
      ...new Set([
        ...(buyOpt ? [buyOpt.file] : []),
        ...candidates.flatMap((c) => {
          const o = c.ok ? sellOption(c.d, state.w, options) : null;
          return o ? [o.option.file] : [];
        }),
      ]),
    ],
    [buyOpt, candidates, state.w, options],
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

  const result = useMemo(() => {
    if (!quote?.ok || !sellNow || sellNow.date < quote.date || !sellPoints) return null;
    const o = outcome(quote, { date: sellNow.date, price: sellNow.value }, state.qty);
    return { o, be: breakEven(sellPoints, state.date, o.buyPrice) };
  }, [quote, sellNow, sellPoints, state.qty, state.date]);

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
        color: sellDef?.color ?? 'gold',
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
    status = `Tidak ada sumber buyback untuk ${buyLabel}: sumber tidak menampilkan harga beli kembali. Pilih gramasi atau tempat beli lain.`;
  } else if (quote && !quote.ok) status = missingText(quote, buyLabel, state.date);
  else if (quote?.ok && !sellNow)
    status = `Belum ada data buyback ${sourceLabel(sellDef)} ${wText}.`;
  else if (quote?.ok && sellNow && !result) {
    status = `Data buyback terakhir (${formatDate(sellNow.date)}) lebih awal dari tanggal harga beli (${formatDate(quote.date)}).`;
  }

  return (
    <>
      <section className="wrap flex flex-wrap items-stretch gap-[22px] pb-[22px]">
        <form
          aria-label="Data pembelian"
          onSubmit={(e) => e.preventDefault()}
          className={cn(
            PANEL,
            'flex flex-[1_1_340px] flex-col gap-4 rounded-[22px] p-6 max-sm:p-4',
          )}
        >
          <h2 className="m-0 text-base font-semibold">Pembelian</h2>
          <div className="flex flex-col gap-1.5">
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
          <div className="flex flex-col gap-1.5">
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
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="kalk-w" className="text-xs text-muted">
                Gramasi
              </label>
              <select
                id="kalk-w"
                className={FIELD}
                value={String(state.w)}
                onChange={(e) => commit({ w: Number(e.target.value) })}
              >
                {weights.map((w) => (
                  <option key={w} value={String(w)}>
                    {formatWeight(w)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
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
          <div
            className="rounded-[12px] bg-surface2 px-3.5 py-3 text-[13px] leading-[1.55] text-muted"
            aria-live="polite"
          >
            {!ready ? (
              'Memuat harga beli…'
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
                      className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-gold underline"
                    >
                      Pakai {formatDate(quote.suggest)}
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              EMPTY
            )}
          </div>
          <div className="h-px bg-line" />
          <h2 className="m-0 text-base font-semibold">Penjualan kembali</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="kalk-sell" className="text-xs text-muted">
              Dijual ke (buyback)
            </label>
            <select
              id="kalk-sell"
              className={FIELD}
              value={sellDef?.id ?? ''}
              onChange={(e) => commit({ sellId: e.target.value })}
            >
              {sellDef ? null : <option value="">Tidak ada buyback untuk pilihan ini</option>}
              {candidates.map(({ d, ok }) => {
                const last = ok
                  ? (() => {
                      const p = piecesOf(d, 'buyback');
                      return p ? latestPoint(p) : null;
                    })()
                  : null;
                return (
                  <option key={d.id} value={d.id} disabled={!ok}>
                    {sourceLabel(d)} ·{' '}
                    {!ok
                      ? 'buyback tidak tersedia'
                      : last
                        ? `${formatRupiah(last.value)}${d.linear ? `/${wText}` : ''}`
                        : 'buyback tersedia'}
                  </option>
                );
              })}
            </select>
          </div>
        </form>

        <div
          className={cn(
            PANEL,
            'flex flex-[1.4_1_460px] flex-col gap-[22px] rounded-[22px] p-7 max-sm:p-4',
          )}
        >
          {o && result ? (
            <>
              <div>
                <div className="eyebrow text-faint">{headline} jika dijual hari ini</div>
                <div
                  className={cn(
                    'num serif mt-3 text-[76px] leading-none break-words max-sm:text-[44px]',
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
                <div className="bg-surface p-4">
                  <div className="text-xs text-faint">Modal</div>
                  <div className="num mt-1.5 text-[19px] font-semibold">
                    {formatRupiah(o.modal)}
                  </div>
                  <div className="num mt-1 text-xs text-muted">
                    {formatNumber(o.qty)} × {formatRupiah(o.buyPrice)}
                  </div>
                </div>
                <div className="bg-surface p-4">
                  <div className="text-xs text-faint">Nilai jual hari ini</div>
                  <div className="num mt-1.5 text-[19px] font-semibold">
                    {formatRupiah(o.value)}
                  </div>
                  <div className="num mt-1 text-xs text-muted">
                    {formatNumber(o.qty)} × {formatRupiah(o.sellPrice)}
                  </div>
                </div>
                <div className="bg-surface p-4">
                  <div className="text-xs text-faint">
                    {result.be.reached ? 'Titik impas tercapai' : 'Titik impas'}
                  </div>
                  <div className="num mt-1.5 text-[19px] font-semibold">
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
              {!result.be.reached && result.be.lastAbove ? (
                <p className="num m-0 text-[12.5px] text-muted">
                  Terakhir buyback di atas harga beli: {formatDate(result.be.lastAbove)}.
                </p>
              ) : null}
              {result.be.truncated && result.be.firstDate ? (
                <p className="m-0 text-[12.5px] text-muted" role="note">
                  Data buyback {sellDef ? sourceLabel(sellDef) : ''} baru ada sejak{' '}
                  {formatDate(result.be.firstDate)}; titik impas dan grafik sebelum tanggal itu
                  tidak diketahui.
                </p>
              ) : null}
              {sellNow &&
              sellNow.date < asOf &&
              daysBetween(sellNow.date, asOf) > CALCULATOR_TOLERANCE_DAYS ? (
                <p className="num m-0 text-[12.5px] text-muted" role="note">
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
              <div className="num serif mt-3 text-[76px] leading-none text-faint max-sm:text-[44px]">
                {EMPTY}
              </div>
              <p className="m-0 mt-3 text-sm leading-relaxed text-muted" role="status">
                {status ?? 'Lengkapi data pembelian.'}
              </p>
            </div>
          )}
          <p className="m-0 text-[12.5px] leading-[1.6] text-muted">
            Belum memperhitungkan PPh 22 yang dapat dipotong saat menjual kembali
            {isLm ? ' dan PPh 0,25% pada pembelian Logam Mulia (harga dasar)' : ''}. Hitungan ini
            bukan rekomendasi investasi.
          </p>
        </div>
      </section>

      <section className="wrap pb-16">
        <div className={cn(PANEL, 'rounded-[22px]')}>
          <h2 className="m-0 text-[19px] font-semibold">Nilai jual sejak tanggal beli</h2>
          <p className="num m-0 mt-1.5 mb-4 text-[13px] text-muted">
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
