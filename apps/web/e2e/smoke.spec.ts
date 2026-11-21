import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { path: '/', heading: /Harga emas\s+hari ini/, marker: /Rp\s?\d{1,3}(\.\d{3})+/ },
  { path: '/explorer', heading: /Telusuri setiap seri harga/, marker: /\d+ brand/ },
  {
    path: '/spread',
    heading: /Jarak antara harga beli\s+dan jual kembali/,
    marker: /Rp\s?\d{1,3}(\.\d{3})+/,
  },
  {
    path: '/kalkulator',
    heading: /Kalau dijual hari ini,\s+untung berapa\?/,
    marker: /Rp\s?\d{1,3}(\.\d{3})+/,
  },
  {
    path: '/kelipatan',
    heading: /Emas naik\s+×\d+[,.]?\d*\s+dalam rupiah sejak 1996/,
    marker: /Rp\s?\d{1,3}(\.\d{3})+/,
  },
  { path: '/data', heading: /Unduh\s+setiap seri/, marker: /Data terakhir/ },
] as const;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

for (const p of PAGES) {
  test(`${p.path} render heading, data nyata, tanpa error`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(p.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.heading);
    await expect(page.locator('main')).toContainText(p.marker);
    await expect(page.locator('footer')).toContainText('Bukan rekomendasi investasi');
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test(`${p.path} tanpa scroll horizontal di 360px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(p.path);
    await page.waitForLoadState('load');
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}

test.describe('Beranda', () => {
  test('kartu: Antam, UBS, Galeri24, Lotus Archi, Tabungan Emas; tanpa kartu ganda', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    const bars = page.getByRole('list', { name: 'Harga emas per penerbit' });
    const titles = bars.getByRole('heading', { level: 2 });
    // EMASKU (hrtagold.id) muncul sebagai kartu kelima setelah data pertamanya ada (Fase 7).
    const names = (await titles.allTextContents()).filter((t) => t !== 'EMASKU');
    expect(names).toEqual(['Antam', 'UBS', 'Galeri24', 'Lotus Archi', 'Tabungan Emas']);
    // Deskripsi Tabungan Emas ada di panel ⓘ, bukan di badan kartu.
    await expect(page.getByRole('article', { name: 'Tabungan Emas' })).not.toContainText(
      'Produk lain dari emas batangan',
    );
    await page.getByRole('button', { name: 'Keterangan Tabungan Emas' }).click();
    await expect(page.getByRole('note')).toContainText('Produk lain dari emas batangan');
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Galeri24', exact: true }),
    ).toHaveCount(1);
    // Galeri24 dan Lotus Archi punya buyback (bukan "tidak ditampilkan").
    for (const name of ['Galeri24', 'Lotus Archi']) {
      const card = bars.locator('article').filter({ has: page.getByRole('heading', { name }) });
      await expect(card).toContainText(/Buyback\s*Rp/);
      await expect(card).not.toContainText('tidak ditampilkan');
    }
    // Catatan kartu memuat harga Pegadaian dan atribusi Galeri24.
    await page.getByRole('button', { name: 'Keterangan Galeri24' }).click();
    await expect(page.getByRole('note')).toContainText('Di Pegadaian: Rp');
    await expect(page.getByRole('note')).toContainText('galeri24.co.id');
    expect(errors).toEqual([]);
  });

  test('matriks memuat kolom Galeri24 dan Lotus Archi; FAQ dua buyback Antam', async ({ page }) => {
    await page.goto('/');
    const table = page.getByRole('table', { name: 'Perbandingan harga per gramasi' });
    await expect(table.getByRole('columnheader', { name: /Lotus Archi/ })).toBeVisible();
    await expect(
      table.getByRole('columnheader', { name: 'Galeri24 Galeri24', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Kenapa Antam punya dua harga buyback di Galeri24?')).toBeVisible();
    await expect(page.getByText('Kenapa buyback Galeri24 kosong?')).toHaveCount(0);
  });

  test('matriks gramasi: ganti mode menandai sel terbaik dan memperbarui hint', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Bandingkan per gramasi' })).toBeVisible();
    const table = page.getByRole('table', { name: 'Perbandingan harga per gramasi' });
    await expect(table.getByTestId('matrix-row').first()).toBeVisible();
    await expect(page.getByText('Harga jual termurah di tiap gramasi ditandai.')).toBeVisible();
    await expect(table.getByTestId('matrix-best').first()).toHaveText('termurah');

    await page.getByRole('radio', { name: 'Buyback', exact: true }).click();
    await expect(page.getByText('Buyback tertinggi di tiap gramasi ditandai.')).toBeVisible();
    await expect(table.getByTestId('matrix-best').first()).toHaveText('tertinggi');

    await page.getByRole('radio', { name: 'Spread', exact: true }).click();
    await expect(table.getByTestId('matrix-best').first()).toHaveText('terkecil');
    await expect(table).toContainText('%');

    await page.getByRole('radio', { name: 'Per gram', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Per gram', exact: true })).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('tren: periode dapat diganti dan statistik per brand tampil', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Tren harga jual 1 gram' })).toBeVisible();
    await expect(page.getByTestId('trend-stat')).toHaveCount(6);
    await expect(page.getByTestId('trend-stat').first()).toContainText('Tertinggi');
    await page.getByRole('radio', { name: '90H', exact: true }).click();
    await expect(page.getByRole('radio', { name: '90H', exact: true })).toBeChecked();
    await expect(page.getByTestId('trend-stat').first()).toContainText('Rata-rata');
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });
});

test.describe('Explorer (Riwayat harga, D-71)', () => {
  const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Pengaturan lanjutan' });
  const openAdvanced = async (page: Page) => {
    await page.getByRole('button', { name: /^Lanjutan/ }).click();
    await expect(dialogOf(page)).toBeVisible();
    return dialogOf(page);
  };
  const paramsOf = (page: Page) => new URL(page.url()).searchParams;

  test('mode dasar bawaan: satu grafik harga jual dan empat brand', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/explorer');
    await expect(page).toHaveTitle('Riwayat harga · Momen Emas');
    await expect(page.getByRole('button', { name: /^Gramasi\s*1 g/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Tampilkan\s*Harga jual/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^4 brand/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Harga jual 1 g', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Grafik harga/ })).toHaveCount(1);
    await expect(page.getByRole('img', { name: /^Grafik spread/ })).toHaveCount(0);
    // Panel kiri lama sudah tidak ada.
    await expect(page.getByText('Tambah series')).toHaveCount(0);
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('daftar "Dalam rentang ini": 4 baris, satu terbaik, detail, urutan (D-74)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/explorer');
    await expect(
      page.getByRole('heading', { name: 'Dalam rentang ini', exact: true }),
    ).toBeVisible();
    // Kartu statistik dan tabel lama sudah tidak ada.
    await expect(page.getByRole('table', { name: 'Ringkasan rentang' })).toHaveCount(0);
    const list = page.getByRole('list', { name: 'Dalam rentang ini', exact: true });
    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(4);
    await expect(list.locator('[data-best="true"]')).toHaveCount(1);
    await expect(list.locator('[data-best="true"]').getByRole('button')).toHaveAccessibleName(
      /\(termurah\)/,
    );

    const first = rows.first().getByRole('button');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await first.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(rows.first().getByText('Terendah', { exact: true })).toBeVisible();
    await expect(rows.first().getByText('Tertinggi', { exact: true })).toBeVisible();

    const names = () => rows.getByRole('button').allTextContents();
    const before = await names();
    await page.getByRole('radio', { name: 'Perubahan', exact: true }).click();
    await expect(rows).toHaveCount(4);
    await expect.poll(async () => (await names()).join('|')).not.toBe(before.join('|'));
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('daftar: Jual + spread menambah detail spread; seri manual tanpa penanda', async ({
    page,
  }) => {
    await page.goto('/explorer?v=both');
    const list = page.getByRole('list', { name: 'Dalam rentang ini', exact: true });
    await expect(list.getByRole('listitem')).toHaveCount(4);
    await expect(page.getByRole('radio', { name: 'Spread', exact: true })).toBeVisible();
    await list.getByRole('listitem').first().getByRole('button').click();
    await expect(list.getByText('Spread kini', { exact: true })).toBeVisible();
    await expect(list.getByText('Tersempit', { exact: true })).toBeVisible();

    await page.goto('/explorer?s=logammulia-antam-1-sell,galeri24-galeri24-1-sell');
    const manual = page.getByRole('list', { name: 'Dalam rentang ini', exact: true });
    await expect(manual.getByRole('listitem')).toHaveCount(2);
    await expect(manual.locator('[data-best="true"]')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Bawaan', exact: true })).toBeVisible();
  });

  test('dropdown Brand: centang mengubah b di URL; Semua dan Kosongkan', async ({ page }) => {
    await page.goto('/explorer');
    const trigger = page.getByRole('button', { name: /^4 brand/ });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const group = page.getByRole('group', { name: 'Brand', exact: true });
    await group.getByRole('checkbox', { name: /^Antam\s*Logam Mulia/ }).uncheck();
    await expect.poll(() => paramsOf(page).get('b')).toBe('ubsl-ubs,g24-g24,hr-emasku');
    await expect(page.getByRole('button', { name: /^3 brand/ })).toBeVisible();
    await group.getByRole('button', { name: 'Kosongkan' }).click();
    await expect.poll(() => paramsOf(page).get('b')).toBe('-');
    await group.getByRole('button', { name: 'Semua' }).click();
    await expect.poll(() => paramsOf(page).get('b')).toContain('lm-antam');
    await page.keyboard.press('Escape');
    await expect(group).toHaveCount(0);
  });

  test('Tampilkan Spread: v=spread, brand tanpa buyback nonaktif, satu grafik persen', async ({
    page,
  }) => {
    await page.goto('/explorer');
    await page.getByRole('button', { name: /^Tampilkan/ }).click();
    await page
      .getByRole('group', { name: 'Tampilkan', exact: true })
      .getByRole('button', { name: 'Spread', exact: true })
      .click();
    await expect.poll(() => paramsOf(page).get('v')).toBe('spread');
    await expect(page.getByRole('heading', { name: 'Spread 1 g', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Grafik spread/ })).toHaveCount(1);
    await expect(page.getByRole('img', { name: /^Grafik harga/ })).toHaveCount(0);
    await page.getByRole('button', { name: /\d+ brand/ }).click();
    const group = page.getByRole('group', { name: 'Brand', exact: true });
    for (const name of [/^Antam\s*Pegadaian/, /^UBS\s*Pegadaian/]) {
      const row = group.getByRole('checkbox', { name });
      await expect(row).toBeDisabled();
      await expect(row).toHaveAccessibleName(/tanpa buyback/);
    }
    await expect(group.getByRole('checkbox', { name: /^Tabungan Emas/ })).toBeEnabled();
  });

  test('Jual + spread: dua grafik, harga di atas spread', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/explorer?v=both');
    await expect(
      page.getByRole('heading', { name: 'Harga jual dan spread 1 g', exact: true }),
    ).toBeVisible();
    const price = page.getByRole('img', { name: /^Grafik harga/ });
    const spread = page.getByRole('img', { name: /^Grafik spread/ });
    await expect(price).toHaveCount(1);
    await expect(spread).toHaveCount(1);
    const pb = await price.boundingBox();
    const sb = await spread.boundingBox();
    expect(pb!.y).toBeLessThan(sb!.y);
    expect(sb!.height).toBeLessThanOrEqual(pb!.height);
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('gramasi lain: g di URL, rentang dipertahankan', async ({ page }) => {
    await page.goto('/explorer?r=6B');
    await page.getByRole('button', { name: /^Gramasi/ }).click();
    await page
      .getByRole('group', { name: 'Gramasi', exact: true })
      .getByRole('button', { name: '5 g', exact: true })
      .click();
    await expect.poll(() => paramsOf(page).get('g')).toBe('5');
    expect(paramsOf(page).get('r')).toBe('6B');
    await expect(page.getByRole('heading', { name: /^Harga jual 5 g/ })).toBeVisible();
  });

  test('tautan lama ?s= : mode seri manual dengan seri Galeri24 / Antam non-Pegadaian', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(
      '/explorer?s=galeri24-lotusarchi-1-buyback,galeri24-antam_np-1-buyback,galeri24-antam-1-buyback',
    );
    await expect(page.getByRole('button', { name: /^Seri manual \(3\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Gramasi/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kembali ke pengaturan dasar' })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Grafik harga/ })).toHaveCount(1);
    const dlg = await openAdvanced(page);
    await expect(
      dlg.getByRole('button', { name: /^Hapus series Antam non-Pegadaian/ }),
    ).toHaveCount(1);
    await expect(dlg.getByRole('button', { name: /^Hapus series Lotus Archi/ })).toHaveCount(1);
    // Form tambah: brand Lotus Archi, sumber Galeri24, dan Antam non-Pegadaian terpisah.
    await dlg.getByRole('button', { name: '+ Tambah seri' }).click();
    const brand = dlg
      .locator('label')
      .filter({ hasText: /^Brand/ })
      .locator('select');
    await expect(brand.locator('option', { hasText: 'Lotus Archi' })).toHaveCount(1);
    await expect(brand.locator('option', { hasText: 'Antam non-Pegadaian' })).toHaveCount(1);
    await brand.selectOption({ label: 'Antam non-Pegadaian' });
    await expect(
      dlg
        .locator('label')
        .filter({ hasText: /^Sumber/ })
        .locator('option'),
    ).toHaveText(['Galeri24']);
    await expect(dlg.getByLabel('Jenis harga').locator('option')).toHaveText(['Buyback']);
    expect(errors).toEqual([]);
  });

  const START = '/explorer?s=logammulia-antam-1-sell,pegadaian-pegadaian-0.01-buyback&r=3B';

  async function expectState(page: Page) {
    await expect(page.getByRole('button', { name: /^Seri manual \(2\)/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: '3B', exact: true })).toBeChecked();
  }

  test('seri dan rentang dipulihkan saat reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await expectState(page);
    await page.reload();
    await expectState(page);
    expect(paramsOf(page).get('r')).toBe('3B');
    expect(paramsOf(page).get('s')).toBe(
      'logammulia-antam-1-sell,pegadaian-pegadaian-0.01-buyback',
    );
    expect(errors).toEqual([]);
  });

  test('mode, agregasi, pita, dan isi celah dipulihkan saat reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&m=idx&agg=w&band=1&ffill=0`);
    const check = async () => {
      const dlg = await openAdvanced(page);
      await expect(dlg.getByRole('radio', { name: 'Indeks', exact: true })).toBeChecked();
      await expect(dlg.getByRole('radio', { name: 'Mingguan', exact: true })).toBeChecked();
      await expect(dlg.getByRole('switch', { name: /Pita min–maks/ })).toBeChecked();
      await expect(dlg.getByRole('switch', { name: /Isi hari tanpa data/ })).not.toBeChecked();
      await dlg.getByRole('button', { name: 'Selesai' }).click();
      await expect(dlg).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /^Indeks harga/ })).toBeVisible();
      await expect(page.getByText(/penutupan mingguan/)).toBeVisible();
    };
    await check();
    await page.reload();
    await check();
    const q = paramsOf(page);
    expect([q.get('m'), q.get('agg'), q.get('band'), q.get('ffill')]).toEqual([
      'idx',
      'w',
      '1',
      '0',
    ]);
    expect(errors).toEqual([]);
  });

  test('Lanjutan: mengubah tampilan memperbarui URL; bawaan tidak ditulis', async ({ page }) => {
    await page.goto('/explorer');
    const dlg = await openAdvanced(page);
    await dlg.getByRole('radio', { name: '% ubah', exact: true }).click();
    await dlg.getByRole('radio', { name: 'Bulanan', exact: true }).click();
    const ffill = dlg.getByRole('switch', { name: /Isi hari tanpa data/ });
    await expect(ffill).toBeChecked();
    await ffill.click();
    await expect(page).toHaveURL(/[?&]m=pct(&|$)/);
    await expect(page).toHaveURL(/[?&]agg=m(&|$)/);
    await expect(page).toHaveURL(/[?&]ffill=0(&|$)/);
    await dlg.getByRole('radio', { name: 'Per keping', exact: true }).click();
    await dlg.getByRole('radio', { name: 'Harian', exact: true }).click();
    await ffill.click();
    await expect(page).not.toHaveURL(/[?&](m|agg|ffill)=/);
    await expect(dlg.getByRole('switch', { name: /Pita min–maks/ })).toBeDisabled();
  });

  test('Lanjutan: Escape menutup dan fokus kembali ke tombolnya', async ({ page }) => {
    await page.goto('/explorer');
    const btn = page.getByRole('button', { name: /^Lanjutan/ });
    await btn.click();
    await expect(dialogOf(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(btn).toBeFocused();
  });

  test('Kembali ke pengaturan dasar menghapus s dan memulihkan dropdown', async ({ page }) => {
    await page.goto(START);
    const dlg = await openAdvanced(page);
    await dlg.getByRole('button', { name: 'Kembali ke pengaturan dasar' }).click();
    await expect.poll(() => paramsOf(page).get('s')).toBeNull();
    expect(paramsOf(page).get('r')).toBe('3B');
    await expect(page.getByRole('button', { name: /^Gramasi/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /\d+ brand/ })).toBeVisible();
    await dlg.getByRole('button', { name: 'Selesai' }).click();
    await expect(dlg).toHaveCount(0);
  });

  test('mengubah rentang memperbarui URL', async ({ page }) => {
    await page.goto(START);
    await page.getByRole('radio', { name: '1T', exact: true }).click();
    await expect(page).toHaveURL(/[?&]r=1T(&|$)/);
    await expect(page.getByRole('radio', { name: '1T', exact: true })).toBeChecked();
  });

  for (const width of [375, 768]) {
    test(`tanpa gulir horizontal di ${width}px, dropdown Brand tidak meluap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/explorer');
      await page.getByRole('button', { name: /^4 brand/ }).click();
      const panel = page.getByRole('group', { name: 'Brand', exact: true });
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});

test.describe('Spread', () => {
  test('opsi Galeri24 dan Lotus Archi; pasangan populer mengisi jual dan buyback', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/spread');
    const buyAt = page.locator('#buyAt');
    const sellTo = page.locator('#sellTo');
    for (const v of ['g24-antam', 'g24-ubs', 'g24-g24', 'g24-lotus', 'pg-lotus']) {
      await expect(buyAt.locator(`option[value="${v}"]`)).toHaveCount(1);
    }
    await expect(buyAt.locator('option[value="g24-antam-np"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Galeri24: Galeri24 → Galeri24' }).click();
    await expect(buyAt).toHaveValue('g24-g24');
    await expect(sellTo).toHaveValue('g24-g24');

    await page
      .getByRole('button', { name: 'Antam: Logam Mulia → Galeri24 (non-Pegadaian)' })
      .click();
    await expect(buyAt).toHaveValue('lm-antam');
    await expect(sellTo).toHaveValue('g24-antam-np');
    await expect(sellTo.locator('option[value="g24-antam-np"]')).toHaveText(
      'Galeri24 · Antam (dibeli di luar Pegadaian) · 1 g',
    );
    // Hanya pembelian Antam yang bisa dijual ke np.
    await buyAt.selectOption('g24-lotus');
    await expect(sellTo.locator('option[value="g24-antam-np"]')).toHaveCount(0);
    await expect(sellTo).toHaveValue('g24-lotus');
    await buyAt.selectOption('pg-lotus');
    await expect(sellTo).toHaveValue('g24-lotus');
    await expect(page.getByText(/Galeri24 membeli kembali Antam dengan dua harga/)).toBeVisible();
    // lotusarchi.com (P6-09): opsi hanya muncul setelah ada data; jual dan buyback konsisten.
    if ((await buyAt.locator('option[value="la-lotus"]').count()) === 1) {
      await buyAt.selectOption('la-lotus');
      await expect(sellTo).toHaveValue('g24-lotus'); // pasangan sah pertama; la-lotus tersedia di daftar
      await expect(sellTo.locator('option[value="la-lotus"]')).toHaveText(
        'Lotus Archi · Lotus Archi · 1 g',
      );
    }
    expect(errors).toEqual([]);
  });

  test('spread per gramasi: tujuh sumber, ganti sumber, gramasi 1 g disorot', async ({ page }) => {
    await page.goto('/spread');
    const src = page.locator('#barSrc');
    // Opsi EMASKU ('Hartadinata · EMASKU') baru muncul setelah ada data hrtagold; sisanya tetap.
    const barOptions = (await src.locator('option').allTextContents()).filter(
      (t) => t !== 'Hartadinata · EMASKU',
    );
    expect(barOptions).toEqual([
      'UBS Lifestyle · UBS (tahun produksi berjalan)',
      'Logam Mulia · Antam (buyback per gram)',
      'Galeri24 · Antam (buyback biasa)',
      'Galeri24 · UBS',
      'Galeri24 · Galeri24',
      'Galeri24 · Lotus Archi',
      'Lotus Archi (situs resmi) · buyback per gram',
    ]);
    await src.selectOption({ label: 'Galeri24 · Lotus Archi' });
    const list = page.getByRole('list', { name: 'Spread persen per gramasi' });
    await expect(list.getByRole('listitem')).toHaveCount(6);
    await expect(list.getByRole('listitem').filter({ hasText: '1 g' }).first()).toBeVisible();
    await expect(page.getByText(/1 g = gramasi acuan/)).toBeVisible();
  });
});

test.describe('EMASKU / Hartadinata (Fase 7)', () => {
  // Dijaga agar lulus sebelum dan sesudah data hrtagold pertama: bagian berdata bersyarat.
  test('footer menyebut sumber Hartadinata; matriks punya kolom EMASKU', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer')).toContainText('Hartadinata (EMASKU, hrtagold.id)');
    await expect(page.locator('footer')).toContainText('sudah termasuk pajak');
    const table = page.getByRole('table', { name: 'Perbandingan harga per gramasi' });
    await expect(table.getByRole('columnheader', { name: /EMASKU/ })).toBeVisible();
  });

  for (const width of [375, 768, 1024, 1280, 1440]) {
    test(`beranda tanpa gulir horizontal dan kartu sama tinggi di ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('load');
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      // Kartu satu baris sama tinggi (sel grid meregang); dikelompokkan menurut posisi atas.
      const boxes = await page.locator('main article').evaluateAll((els) =>
        els
          .map((e) => e.getBoundingClientRect())
          .map((r) => ({
            top: Math.round(r.top),
            h: Math.round(r.height),
            w: Math.round(r.width),
          })),
      );
      const rows = new Map<number, number[]>();
      for (const b of boxes) rows.set(b.top, [...(rows.get(b.top) ?? []), b.h]);
      for (const heights of rows.values()) {
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
      }
    });
  }

  test('kartu EMASKU: Gold 1 g, pajak, Prime hanya catatan; pembanding kemarin', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const card = page.getByRole('heading', { level: 2, name: 'EMASKU', exact: true });
    if ((await card.count()) === 0) return; // belum ada data hrtagold
    const article = page.locator('article').filter({ has: card });
    await expect(article).toContainText(/Buyback\s*Rp/);
    await expect(article).not.toContainText('tidak ditampilkan');
    await expect(article).toContainText(/Prime 25 g: Rp/);
    // Tanpa pembanding kemarin: teks jelas, bukan "—" kosong.
    const t = await article.innerText();
    expect(t).toMatch(/vs |Belum ada pembanding kemarin/);
    await page.getByRole('button', { name: 'Keterangan EMASKU' }).click();
    await expect(page.getByRole('note')).toContainText('sudah termasuk pajak');
    await expect(page.getByRole('note')).toContainText('hrtagold.id');
  });

  // Kartu seragam: 1 kolom (375), 2 (768), 3 (1280/1440); Tabungan Emas selebar kartu lain.
  for (const [width, cols] of [
    [375, 1],
    [768, 2],
    [1280, 3],
    [1440, 3],
  ] as const) {
    test(`kartu harga seragam: ${cols} kolom di ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const boxes = await page
        .locator('main section')
        .first()
        .locator('article')
        .evaluateAll((els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            };
          }),
        );
      expect(boxes.length).toBeGreaterThanOrEqual(5);
      const xs = new Set(boxes.map((b) => b.x));
      expect(xs.size).toBe(cols);
      for (const b of boxes) expect(Math.abs(b.w - boxes[0]!.w)).toBeLessThanOrEqual(1);
      const tab = await page.getByRole('article', { name: 'Tabungan Emas' }).boundingBox();
      expect(Math.abs(tab!.width - boxes[0]!.w)).toBeLessThanOrEqual(1);
    });
  }

  test('statistik tren: 3 kolom di tablet dan desktop, judul satu baris', async ({ page }) => {
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const stats = page.getByTestId('trend-stat');
      await expect(stats).toHaveCount(6);
      const xs = await stats.evaluateAll((els) => [
        ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().x))),
      ]);
      expect(xs.length).toBe(3);
      const hs = await stats.evaluateAll((els) =>
        els.map((e) => Math.round(e.getBoundingClientRect().height)),
      );
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(1);
    }
  });

  test('Spread dan Explorer: opsi EMASKU bersyarat data; Prime seri sendiri', async ({ page }) => {
    await page.goto('/spread');
    const buyAt = page.locator('#buyAt');
    if ((await buyAt.locator('option[value="hr-emasku"]').count()) === 1) {
      await page.getByRole('button', { name: 'EMASKU: Hartadinata → Hartadinata' }).click();
      await expect(buyAt).toHaveValue('hr-emasku');
      await expect(page.locator('#sellTo')).toHaveValue('hr-emasku');
    } else {
      await expect(page.getByRole('button', { name: /EMASKU: Hartadinata/ })).toHaveCount(0);
    }
    await page.goto('/explorer');
    // Dropdown Brand memuat EMASKU (Hartadinata) sebagai brand pembanding.
    await page.getByRole('button', { name: /\d+ brand/ }).click();
    await expect(
      page.getByRole('group', { name: 'Brand', exact: true }).getByRole('checkbox', {
        name: /^EMASKU/,
      }),
    ).toHaveCount(1);
    await page.keyboard.press('Escape');
    // Seri manual: Prime brand sendiri bila EMASKU punya data.
    await page.getByRole('button', { name: /^Lanjutan/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Pengaturan lanjutan' });
    await dlg.getByRole('button', { name: '+ Tambah seri' }).click();
    const brand = dlg
      .locator('label')
      .filter({ hasText: /^Brand/ })
      .locator('select');
    const hasEmasku = (await brand.locator('option', { hasText: /^EMASKU/ }).count()) > 0;
    if (hasEmasku) {
      await expect(brand.locator('option', { hasText: 'EMASKU Prime' })).toHaveCount(1);
    }
  });
});

test.describe('Bandingkan (pengalih ke Riwayat harga, D-70, D-71)', () => {
  test('tautan lama diteruskan: gramasi, mode, dan rentang dipertahankan', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/bandingkan?w=5&m=idx&r=6B');
    await expect(page).toHaveURL(/\/explorer\?/);
    const q = new URL(page.url()).searchParams;
    expect(q.get('g')).toBe('5');
    expect(q.get('b')).toContain('lm-antam');
    expect(q.get('s')).toBeNull();
    expect([q.get('m'), q.get('r')]).toEqual(['idx', '6B']);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Telusuri setiap seri harga/);
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('tanpa parameter: 1 g per gram, semua brand yang ada', async ({ page }) => {
    await page.goto('/bandingkan');
    await expect(page).toHaveURL(/\/explorer\?/);
    const q = new URL(page.url()).searchParams;
    expect(q.get('g')).toBe('1');
    expect(q.get('b')).toContain('lm-antam');
    expect(q.get('m')).toBe('gram');
    await expect(page.getByRole('button', { name: /^Gramasi\s*1 g/ })).toBeVisible();
  });
});

test.describe('Kelipatan: premi Antam', () => {
  test('bagian premi memuat penjelasan dan peringatan spot indikatif', async ({ page }) => {
    await page.goto('/kelipatan');
    await expect(page.getByRole('heading', { name: /Berapa mahal emas ritel/ })).toBeVisible();
    await expect(page.getByText(/Spot dunia bersifat indikatif/)).toBeVisible();
    await expect(page.getByText('Ongkos cetak & sertifikat')).toBeVisible();
    await expect(page.getByText('Margin distribusi')).toBeVisible();
  });
});

test.describe('Kelipatan', () => {
  const START = '/kelipatan?b=2010&a=end&lm=0';

  async function expectState(page: Page) {
    await expect(page.getByRole('radio', { name: '2010', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Penutupan akhir tahun' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Garis Antam LM/ })).not.toBeChecked();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('sejak 2010');
    await expect(
      page.getByRole('heading', { name: /sejak 2010 .penutupan akhir tahun/ }),
    ).toBeVisible();
  }

  test('tahun dasar, agregasi, dan garis Antam dipulihkan saat reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await expectState(page);
    await page.reload();
    await expectState(page);
    const q = new URL(page.url()).searchParams;
    expect([q.get('b'), q.get('a'), q.get('lm')]).toEqual(['2010', 'end', '0']);
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('mengubah pilihan memperbarui URL; bawaan tidak ditulis', async ({ page }) => {
    await page.goto('/kelipatan');
    await page.getByRole('radio', { name: '2005', exact: true }).click();
    await page.getByRole('radio', { name: 'Penutupan akhir tahun' }).click();
    await page.getByRole('checkbox', { name: /Garis Antam LM/ }).uncheck();
    await expect(page).toHaveURL(/[?&]b=2005(&|$)/);
    await expect(page).toHaveURL(/[?&]a=end(&|$)/);
    await expect(page).toHaveURL(/[?&]lm=0(&|$)/);
    await page.getByRole('radio', { name: '1996', exact: true }).click();
    await page.getByRole('radio', { name: 'Rata-rata tahunan' }).click();
    await page.getByRole('checkbox', { name: /Garis Antam LM/ }).check();
    await expect(page).not.toHaveURL(/[?&](b|a|lm)=/);
  });

  test('tabel tahunan memuat sumber dan spot indikatif ditegaskan', async ({ page }) => {
    await page.goto('/kelipatan');
    await expect(page.getByRole('heading', { name: 'Angka di balik garis' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Rata-rata tahunan' })).toContainText(
      'xaus · harian',
    );
    // Catatan spot berada di popover ⓘ "Keterangan grafik" sejak 22a3a68; teksnya bahasa awam
    // ("perkiraan", bukan "indikatif") sejak 415ac4a.
    await page.getByRole('button', { name: 'Keterangan grafik' }).click();
    await expect(page.getByText(/Harga spot dari xaus.com hanya perkiraan/)).toBeVisible();
  });
});

test.describe('Data', () => {
  test('kartu Galeri24 dan Antam non-Pegadaian tampil sendiri', async ({ page }) => {
    await page.goto('/data');
    const main = page.locator('main');
    await expect(main).toContainText('Emas batangan · Galeri24');
    await expect(main).toContainText('Antam non-Pegadaian · Galeri24');
    await expect(main).toContainText('Lotus Archi');
    await expect(main).not.toContainText('produksi non_pegadaian');
  });

  test('tombol unduh membuka pop-up konfirmasi, tidak langsung mengunduh', async ({ page }) => {
    await page.goto('/data');
    await expect(page.locator('main')).not.toContainText('sumber tanpa jam');

    let downloaded = false;
    page.on('download', () => {
      downloaded = true;
    });
    await page.getByRole('button', { name: 'Unduh data Emas batangan · Pegadaian' }).click();
    const dialog = page.getByRole('dialog', { name: 'Emas batangan · Pegadaian' });
    await expect(dialog).toBeVisible();
    expect(downloaded).toBe(false);

    // Default CSV seri pertama; ganti ke UBS + JSON memperbarui nama berkas dan tautan.
    await expect(dialog.getByText('pegadaian-galeri24.csv')).toBeVisible();
    await dialog.getByText('UBS', { exact: true }).click();
    await dialog.getByText('JSON', { exact: true }).click();
    await expect(dialog.getByText('pegadaian-ubs.json')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Unduh JSON' })).toHaveAttribute(
      'href',
      /pegadaian-ubs\.json$/,
    );

    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).toBeHidden();
    expect(downloaded).toBe(false);
  });

  test('konfirmasi di pop-up mengunduh berkas yang dipilih', async ({ page }) => {
    await page.goto('/data');
    await page.getByRole('button', { name: 'Unduh data Antam · Logam Mulia' }).click();
    const dialog = page.getByRole('dialog', { name: 'Antam · Logam Mulia' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('link', { name: 'Unduh CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    await expect(dialog).toBeHidden();
  });
});

test.describe('Kalkulator', () => {
  const START = '/kalkulator?d=2024-03-15&q=3';

  async function expectState(page: Page) {
    await expect(page.getByLabel('Tanggal beli')).toHaveValue('2024-03-15');
    await expect(page.getByLabel('Jumlah keping')).toHaveValue('3');
    await expect(page.getByLabel('Dibeli di')).toHaveValue('lm-antam');
    await expect(page.getByTestId('kalk-profit')).toContainText(/[▲▼]|Rp0/);
  }

  test('beli di Galeri24 Antam: jual ke Galeri24 biasa dan non-Pegadaian', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/kalkulator?b=g24-antam&d=2026-11-10');
    await expect(page.getByLabel('Dibeli di')).toHaveValue('g24-antam');
    const sell = page.locator('#kalk-sell');
    await expect(sell.locator('option[value="lm-antam"]')).toHaveCount(1);
    await expect(sell.locator('option[value="g24-antam"]')).toContainText(
      'Galeri24 · Antam (biasa)',
    );
    await expect(sell.locator('option[value="g24-antam-np"]')).toContainText(
      'Galeri24 · Antam (dibeli di luar Pegadaian)',
    );
    await sell.selectOption('g24-antam-np');
    await expect(page).toHaveURL(/[?&]s=g24-antam-np(&|$)/);
    await expect(page.getByTestId('kalk-profit')).toContainText(/[▲▼]|Rp0/);
    // Pembelian bukan Antam tidak menawarkan np; Lotus Archi punya buyback Galeri24.
    await page.getByLabel('Dibeli di').selectOption('pg-lotus');
    await expect(sell.locator('option[value="g24-antam-np"]')).toHaveCount(0);
    await expect(sell).toHaveValue('g24-lotus');
    expect(errors).toEqual([]);
  });

  test('tanggal dan jumlah dipulihkan saat reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await expectState(page);
    await page.reload();
    await expectState(page);
    const q = new URL(page.url()).searchParams;
    expect([q.get('d'), q.get('q')]).toEqual(['2024-03-15', '3']);
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('mengubah jumlah memperbarui hasil dan URL; bawaan tidak ditulis', async ({ page }) => {
    await page.goto('/kalkulator?d=2024-03-15');
    const modal = page
      .getByText('Modal', { exact: true })
      .locator('xpath=following-sibling::div[1]');
    const before = await modal.innerText();
    await page.getByRole('button', { name: 'Tambah keping' }).click();
    await expect(page).toHaveURL(/[?&]q=2(&|$)/);
    await expect(modal).not.toHaveText(before);
    await page.getByRole('button', { name: 'Kurangi keping' }).click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(modal).toHaveText(before);
  });

  test('tanggal sebelum data pertama menampilkan pesan dan tanggal paling awal', async ({
    page,
  }) => {
    await page.goto('/kalkulator?d=2005-01-03');
    await expect(page.getByText(/Data paling awal: 4 Jan 2010/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Pakai 4 Jan 2010/ })).toBeVisible();
  });

  test('total harga beli bisa diubah, dikembalikan, dan berat lain butuh total', async ({
    page,
  }) => {
    await page.goto('/kalkulator?d=2024-03-15');
    const paid = page.getByLabel(/^Total harga beli/);
    await expect(paid).not.toHaveValue('');
    await expect(page.getByRole('button', { name: 'Kembalikan ke harga resmi' })).toBeHidden();
    await paid.fill('99999999');
    await expect(page).toHaveURL(/[?&]p=99999999(&|$)/);
    await expect(paid).toHaveValue('99.999.999');
    await expect(page.getByText('diubah', { exact: true })).toBeVisible();
    await expect(page.getByTestId('kalk-diff')).toContainText('di atas harga resmi');
    await expect(page.getByTestId('kalk-diff')).toContainText('Periksa lagi nominalnya');
    await page.getByRole('button', { name: 'Kembalikan ke harga resmi' }).click();
    await expect(page).not.toHaveURL(/[?&]p=/);
    await expect(page.getByTestId('kalk-diff')).toBeHidden();

    await page.getByLabel('Gramasi').selectOption({ label: 'Berat lain…' });
    await page.getByLabel('Berat lain (gram)').fill('2.5');
    await expect(page).toHaveURL(/[?&]w=2\.5(&|$)/);
    await expect(page.getByText(/tidak punya harga resmi/).first()).toBeVisible();
    await page.getByLabel(/^Total harga beli/).fill('15000000');
    await expect(page.getByTestId('kalk-profit')).toContainText(/[▲▼]|Rp0/);
  });

  test('mengetik di tengah total harga beli tidak memindahkan kursor ke akhir', async ({
    page,
  }) => {
    await page.goto('/kalkulator?p=2000000');
    const paid = page.getByLabel(/^Total harga beli/);
    await expect(paid).toHaveValue('2.000.000');
    await paid.click();
    await paid.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));
    await page.keyboard.type('5');
    await expect(paid).toHaveValue('25.000.000');
    expect(await paid.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(2);
    await page.keyboard.type('1');
    await expect(paid).toHaveValue('251.000.000');
    expect(await paid.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(3);
    // Backspace tepat setelah titik menghapus digit sebelum titik.
    await paid.evaluate((el: HTMLInputElement) => el.setSelectionRange(4, 4));
    await page.keyboard.press('Backspace');
    await expect(paid).toHaveValue('25.000.000');
    expect(await paid.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(2);
  });
});

test('navigasi utama memuat keenam halaman dan semua tautannya sampai', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' }).first();
  const links = nav.getByRole('link');
  await expect(links).toHaveCount(PAGES.length);
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toEqual(PAGES.map((p) => p.path));
  for (const p of PAGES) {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .first()
      .locator(`a[href="${p.path}"]`)
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.heading);
    await expect(
      page
        .getByRole('navigation', { name: 'Navigasi utama' })
        .first()
        .locator('a[aria-current="page"]'),
    ).toHaveAttribute('href', p.path);
  }
  expect(errors).toEqual([]);
});

test('menu bawah HP: empat tab utama, "Lainnya" membuka sisa halaman dan tombol tema', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', '/');
  await expect(page.getByRole('switch', { name: 'Mode gelap' })).toBeHidden();

  const more = nav.getByRole('button', { name: 'Lainnya' });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('switch', { name: 'Mode gelap' })).toBeVisible();
  await nav.locator('a[href="/kelipatan"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PAGES[4].heading);
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toHaveClass(/text-gold-strong/);
  expect(errors).toEqual([]);
});

test('rute tak dikenal menampilkan halaman 404', async ({ page }) => {
  const res = await page.goto('/tidak-ada-halaman');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Halaman\s+tidak ditemukan/);
  await expect(page.getByRole('link', { name: 'Ke Hari ini' })).toBeVisible();
});
