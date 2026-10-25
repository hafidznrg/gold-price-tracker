/**
 * Versi skema data (semver, DATA-MODEL §8). Tambah kolom di akhir = minor;
 * ubah arti/urutan kolom = major + skrip migrasi.
 */
export const SCHEMA_VERSION = '1.0.0';

export * from './enums';
export * from './normalize';
export * from './dates';
export * from './rows';
export * from './csv';
export * from './config';
