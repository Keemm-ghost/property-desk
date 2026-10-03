// Bundles src/ into www/ for Capacitor.
//   npm run build  -> production bundle used for the Android app
//   npm run dev    -> browser demo with fake local data (no cloud), for testing the screens
import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
const demo = process.argv.includes('--demo');
rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
await esbuild.build({
  entryPoints: { app: 'src/app.js', styles: 'src/style.css' }, bundle: true, minify: !demo, target: ['chrome90'],
  outdir: 'www', define: { __DEMO__: JSON.stringify(demo) }, legalComments: 'none',
  loader: { '.woff': 'file', '.woff2': 'file' }, assetNames: 'fonts/[name]'
});
writeFileSync('www/index.html', readFileSync('src/index.html', 'utf8'));
console.log('Built www/' + (demo ? ' (demo mode)' : ''));
