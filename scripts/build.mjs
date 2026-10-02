// Aynı kaynaktan (extension/) tarayıcıya özel paketler üretir:
//   dist/firefox   -> Firefox (arka plan sayfası, SVG simge)
//   dist/chromium  -> Chrome ve Edge (service worker, PNG simgeler, offscreen belge)
// ve her biri için yüklenebilir zip dosyası.
//   node scripts/build.mjs            (klasörler + zip)
//   node scripts/build.mjs --no-zip   (yalnızca klasörler; testler için)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'extension');
const dist = path.join(root, 'dist');
const base = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));

const PNG_ICONS = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };

const targets = {
  firefox: {
    // Yalnızca Chrome/Edge'de kullanılan dosyalar Firefox paketine girmez.
    exclude: ['offscreen.html', 'offscreen.js'],
    manifest: (m) => m
  },
  chromium: {
    exclude: [],
    manifest: (m) => {
      const out = structuredClone(m);
      delete out.browser_specific_settings;
      out.background = { service_worker: 'background.js' };
      out.permissions = [...out.permissions, 'offscreen'];
      out.icons = PNG_ICONS;
      out.action.default_icon = PNG_ICONS;
      out.minimum_chrome_version = '116';
      return out;
    }
  }
};

const zip = !process.argv.includes('--no-zip');
fs.mkdirSync(dist, { recursive: true });
// Eski paketleri temizle.
fs.readdirSync(dist).filter((f) => f.endsWith('.zip')).forEach((f) => fs.rmSync(path.join(dist, f)));

for (const [name, t] of Object.entries(targets)) {
  const out = path.join(dist, name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(src, out, {
    recursive: true,
    filter: (p) => !t.exclude.includes(path.relative(src, p))
  });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(t.manifest(base), null, 2) + '\n');
  console.log(`dist/${name} hazır`);

  if (zip) {
    const file = `Material_Converter-${name}-${base.version}.zip`;
    execFileSync('npx', ['-y', 'web-ext', 'build', '-s', out, '-a', dist, '-n', file, '--overwrite-dest'], { stdio: 'ignore' });
    // web-ext dosya adını küçük harfe çevirir; asıl adı geri ver.
    fs.renameSync(path.join(dist, file.toLowerCase()), path.join(dist, file));
    console.log(`dist/${file} hazır`);
  }
}
