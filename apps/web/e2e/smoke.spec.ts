import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { path: '/', heading: /Harga emas\s+hari ini/, marker: /Rp\s?\d{1,3}(\.\d{3})+/ },
  { path: '/explorer', heading: /Telusuri setiap seri harga/, marker: /\d+ dari maks\./ },
  {
    path: '/spread',
    heading: /Jarak antara harga beli\s+dan jual kembali/,
    marker: /Rp\s?\d{1,3}(\.\d{3})+/,
  },
  {
    path: '/bandingkan',
    heading: /Emas fisik dan tabungan\s+di berat yang sama/,
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

    await page.getByRole('radio', { name: 'Selisih', exact: true }).click();
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
    await expect(page.getByTestId('trend-stat')).toHaveCount(4);
    await expect(page.getByTestId('trend-stat').first()).toContainText('Tertinggi');
    await page.getByRole('radio', { name: '90H', exact: true }).click();
    await expect(page.getByRole('radio', { name: '90H', exact: true })).toBeChecked();
    await expect(page.getByTestId('trend-stat').first()).toContainText('Rata-rata');
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });
});

test.describe('Explorer', () => {
  const START = '/explorer?s=logammulia-antam-1-sell,pegadaian-pegadaian-0.01-buyback&r=3B';

  async function expectState(page: Page) {
    await expect(page.getByText('2 dari maks.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Hapus series/ })).toHaveCount(2);
    await expect(page.getByRole('radio', { name: '3B', exact: true })).toBeChecked();
  }

  test('seri dan rentang dipulihkan saat reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await expectState(page);
    await page.reload();
    await expectState(page);
    expect(new URL(page.url()).searchParams.get('r')).toBe('3B');
    expect(new URL(page.url()).searchParams.get('s')).toBe(
      'logammulia-antam-1-sell,pegadaian-pegadaian-0.01-buyback',
    );
    expect(errors).toEqual([]);
  });

  test('mode, agregasi, pita, dan isi celah dipulihkan saat reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${START}&m=idx&agg=w&band=1&ffill=0`);
    const check = async () => {
      await expect(page.getByRole('radio', { name: 'Indeks', exact: true })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'Mingguan', exact: true })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: /Pita min–maks/ })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: /Isi celah/ })).not.toBeChecked();
      await expect(page.getByRole('heading', { name: /Indeks harga .* mingguan/ })).toBeVisible();
    };
    await check();
    await page.reload();
    await check();
    const q = new URL(page.url()).searchParams;
    expect([q.get('m'), q.get('agg'), q.get('band'), q.get('ffill')]).toEqual([
      'idx',
      'w',
      '1',
      '0',
    ]);
    expect(errors).toEqual([]);
  });

  test('mengubah tampilan memperbarui URL; bawaan tidak ditulis', async ({ page }) => {
    await page.goto(START);
    await page.getByRole('radio', { name: '% ubah', exact: true }).click();
    await page.getByRole('radio', { name: 'Bulanan', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /Isi celah/ })).toBeChecked();
    await page.getByRole('checkbox', { name: /Isi celah/ }).uncheck();
    await expect(page).toHaveURL(/[?&]m=pct(&|$)/);
    await expect(page).toHaveURL(/[?&]agg=m(&|$)/);
    await expect(page).toHaveURL(/[?&]ffill=0(&|$)/);
    await page.getByRole('radio', { name: 'Nominal', exact: true }).click();
    await page.getByRole('radio', { name: 'Harian', exact: true }).click();
    await page.getByRole('checkbox', { name: /Isi celah/ }).check();
    await expect(page).not.toHaveURL(/[?&](m|agg|ffill)=/);
  });

  test('mengubah rentang memperbarui URL', async ({ page }) => {
    await page.goto(START);
    await page.getByRole('radio', { name: '1B', exact: true }).click();
    await expect(page).toHaveURL(/[?&]r=1B(&|$)/);
    await expect(page.getByRole('radio', { name: '1B', exact: true })).toBeChecked();
  });
});

test.describe('Bandingkan', () => {
  const START = '/bandingkan?w=5&m=idx&r=6B';

  async function expectState(page: Page) {
    await expect(page.getByRole('radio', { name: '5 g', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Indeks', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: '6B', exact: true })).toBeChecked();
    await expect(page.getByRole('heading', { name: /Indeks harga jual .* 5 g/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hari ini . 5 g/ })).toBeVisible();
  }

  test('gramasi, mode, dan rentang dipulihkan saat reload', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(START);
    await expectState(page);
    await page.reload();
    await expectState(page);
    const q = new URL(page.url()).searchParams;
    expect([q.get('w'), q.get('m'), q.get('r')]).toEqual(['5', 'idx', '6B']);
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('mengubah pilihan memperbarui URL; bawaan tidak ditulis', async ({ page }) => {
    await page.goto('/bandingkan');
    await page.getByRole('radio', { name: '10 g', exact: true }).click();
    await page.getByRole('radio', { name: 'Indeks', exact: true }).click();
    await expect(page).toHaveURL(/[?&]w=10(&|$)/);
    await expect(page).toHaveURL(/[?&]m=idx(&|$)/);
    await page.getByRole('radio', { name: '1 g', exact: true }).click();
    await page.getByRole('radio', { name: 'Per gram', exact: true }).click();
    await expect(page).not.toHaveURL(/[?&](w|m)=/);
  });

  test('premi Antam memuat penjelasan dan peringatan spot indikatif', async ({ page }) => {
    await page.goto('/bandingkan');
    await expect(page.getByRole('heading', { name: /Berapa mahal emas ritel/ })).toBeVisible();
    await expect(page.getByText(/Spot dunia bersifat indikatif/)).toBeVisible();
    await expect(page.getByText('Ongkos cetak & sertifikat')).toBeVisible();
    await expect(page.getByText('Margin distribusi')).toBeVisible();
  });
});

test.describe('Kelipatan', () => {
  const START = '/kelipatan?b=2010&a=end&lm=1';

  async function expectState(page: Page) {
    await expect(page.getByRole('radio', { name: '2010', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Penutupan akhir tahun' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /Garis Antam LM/ })).toBeChecked();
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
    expect([q.get('b'), q.get('a'), q.get('lm')]).toEqual(['2010', 'end', '1']);
    await page.waitForLoadState('load');
    expect(errors).toEqual([]);
  });

  test('mengubah pilihan memperbarui URL; bawaan tidak ditulis', async ({ page }) => {
    await page.goto('/kelipatan');
    await page.getByRole('radio', { name: '2005', exact: true }).click();
    await page.getByRole('radio', { name: 'Penutupan akhir tahun' }).click();
    await page.getByRole('checkbox', { name: /Garis Antam LM/ }).check();
    await expect(page).toHaveURL(/[?&]b=2005(&|$)/);
    await expect(page).toHaveURL(/[?&]a=end(&|$)/);
    await expect(page).toHaveURL(/[?&]lm=1(&|$)/);
    await page.getByRole('radio', { name: '1996', exact: true }).click();
    await page.getByRole('radio', { name: 'Rata-rata tahunan' }).click();
    await page.getByRole('checkbox', { name: /Garis Antam LM/ }).uncheck();
    await expect(page).not.toHaveURL(/[?&](b|a|lm)=/);
  });

  test('tabel tahunan memuat sumber dan spot indikatif ditegaskan', async ({ page }) => {
    await page.goto('/kelipatan');
    await expect(page.getByRole('heading', { name: 'Angka di balik garis' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Rata-rata tahunan' })).toContainText(
      'xaus · harian',
    );
    await expect(page.getByText(/Spot dari xaus.com bersifat indikatif/)).toBeVisible();
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
});

test('navigasi utama memuat ketujuh halaman dan semua tautannya sampai', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Ganti tema terang atau Navy' })).toBeHidden();

  const more = nav.getByRole('button', { name: 'Lainnya' });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('button', { name: /Ganti tema/ })).toBeVisible();
  await nav.locator('a[href="/kalkulator"]').click();
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
