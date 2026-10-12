import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const apiBase = String(process.env.SECRET_SANTA_API_URL || '').replace(/\/$/, '');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(resolve(root, 'static'), output, { recursive: true });
writeFileSync(resolve(output, '.nojekyll'), '');
writeFileSync(
  resolve(output, 'config.js'),
  `window.SECRET_SANTA_CONFIG = Object.freeze({ apiBase: ${JSON.stringify(apiBase)} });\n`,
);

console.log(`GitHub Pages-artifact bygget i ${output}`);
console.log(apiBase ? `API: ${apiBase}` : 'API: ikke konfigurert (sikker informasjonsmodus)');
