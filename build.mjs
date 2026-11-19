// Concatenates src/*.js into dist/jv-hud-cards.js (no dependencies, no transpiling).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const parts = readdirSync('src').filter((f) => f.endsWith('.js')).sort().map((f) => readFileSync(`src/${f}`, 'utf8'));
const out = parts.join('\n').replace("'__VERSION__'", JSON.stringify(pkg.version)).replace("'__REPO__'", JSON.stringify(pkg.homepage));
mkdirSync('dist', { recursive: true });
writeFileSync('dist/jv-hud-cards.js', out);
console.log(`dist/jv-hud-cards.js  v${pkg.version}  ${(out.length / 1024).toFixed(1)} KB`);
