import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { path: '/', heading: /Harga emas\s+hari ini/, marker: /Rp\s?\d{1,3}(\.\d{3})+/ },
  { path: '/explorer', heading: /Telusuri setiap seri harga/, marker: /\d+ dari maks\./ },
  {
    path: '/spread',
    heading: /Jarak antara harga beli\s+dan jual kembali/,
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

  test('mengubah rentang memperbarui URL', async ({ page }) => {
    await page.goto(START);
    await page.getByRole('radio', { name: '1B', exact: true }).click();
    await expect(page).toHaveURL(/[?&]r=1B(&|$)/);
    await expect(page.getByRole('radio', { name: '1B', exact: true })).toBeChecked();
  });
});

test('rute tak dikenal menampilkan halaman 404', async ({ page }) => {
  const res = await page.goto('/tidak-ada-halaman');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Halaman\s+tidak ditemukan/);
  await expect(page.getByRole('link', { name: 'Ke Hari ini' })).toBeVisible();
});
