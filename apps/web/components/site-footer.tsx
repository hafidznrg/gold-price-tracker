import { SCHEMA_VERSION } from '@gold/schema';
import { SITE_NAME } from '@/components/site-header';
import { formatJakartaStamp } from '@/lib/format';

export const REPO_URL = 'https://github.com/hafidznrg/gold-price-tracker';

/** Footer situs (mockup Main.dc.html): tentang, sumber data, catatan disclaimer + PPh 22 (FR-26). */
export function SiteFooter({ builtAt = new Date() }: { builtAt?: Date }) {
  return (
    <footer className="mt-6 border-t border-line">
      <div className="wrap grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-10 gap-y-8 pt-11 pb-10">
        <div className="flex flex-col gap-3">
          <span className="serif text-[22px]">{SITE_NAME}</span>
          <p className="m-0 text-sm leading-[1.65] text-muted">
            Proyek non-komersial. Data dikumpulkan otomatis setiap hari oleh GitHub Actions,
            divalidasi, dan disimpan sebagai CSV di repositori publik.
          </p>
          <a href={REPO_URL} className="text-sm break-words">
            github.com/hafidznrg/gold-price-tracker
          </a>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-2xs font-semibold tracking-[.14em] text-faint uppercase">
            Sumber data
          </span>
          <span className="text-sm leading-normal text-muted">
            Logam Mulia (Antam) · UBS Lifestyle · Pegadaian (Antam, UBS, Galeri24, Tabungan Emas)
          </span>
          <span className="text-sm leading-normal text-muted">
            xaus.com (futures GC=F, spot gold-api.com) · Bank Indonesia JISDOR · ECB via Frankfurter
            · World Bank Pink Sheet · World Bank WDI
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-2xs font-semibold tracking-[.14em] text-faint uppercase">
            Catatan
          </span>
          <p className="m-0 text-sm leading-[1.6] text-muted">
            Bukan rekomendasi investasi. Harga buyback belum memperhitungkan PPh 22 yang dapat
            dipotong saat menjual kembali sesuai ketentuan pajak yang berlaku. Harga jual Logam
            Mulia adalah Harga Dasar, belum termasuk PPh 0,25%. Harga emas dunia bersifat indikatif,
            bukan patokan LBMA.
          </p>
        </div>
      </div>
      <div className="wrap flex flex-wrap justify-between gap-2 pb-8 text-xs text-faint">
        <span>Kode MIT · Data milik masing-masing penerbit</span>
        <span className="tabular-nums">
          Build {formatJakartaStamp(builtAt)} · skema v{SCHEMA_VERSION}
        </span>
      </div>
    </footer>
  );
}
