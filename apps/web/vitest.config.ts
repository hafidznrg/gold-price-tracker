import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Samakan dengan `paths` di tsconfig agar modul yang mengimpor `@/…` bisa diuji.
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  // Impor dinamis @gold/schema (uji kesetaraan salinan klien) bisa > 5 dtk saat dingin.
  test: { exclude: ['node_modules', 'out', '.next', 'e2e/**'], testTimeout: 20_000 },
});
