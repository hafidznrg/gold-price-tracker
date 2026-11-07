import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Impor dinamis @gold/schema (uji kesetaraan salinan klien) bisa > 5 dtk saat dingin.
  test: { exclude: ['node_modules', 'out', '.next', 'e2e/**'], testTimeout: 20_000 },
});
