// Writes an import map into index.html that adds ?v=<version> to every app file, so phones
// load fresh code after each release instead of a copy cached by the browser.
// Run after bumping the version:  npm run stamp
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    const rel = `${dir}/${f}`;
    if (fs.statSync(path.join(root, rel)).isDirectory()) { if (f !== 'vendor') walk(rel); }
    else if (f.endsWith('.js')) files.push(rel);
  }
})('src');
files.sort();

const map = { imports: Object.fromEntries(files.map((f) => [`./${f}`, `./${f}?v=${version}`])) };
const block = `<script type="importmap" id="versions">\n${JSON.stringify(map, null, 2)}\n</script>`;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap" id="versions">[\s\S]*?<\/script>\n?\s*/, '');
html = html.replace(/<link rel="stylesheet" href="src\/styles\.css[^"]*">/, `<link rel="stylesheet" href="src/styles.css?v=${version}">`);
html = html.replace(/<script type="module" src="src\/app\/main\.js[^"]*"><\/script>/, `${block}\n  <script type="module" src="src/app/main.js?v=${version}"></script>`);
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`index.html stamped with v${version} for ${files.length} files`);
