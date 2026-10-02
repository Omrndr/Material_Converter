// Ayrıştırıcıyı gerçek bir tarayıcı DOM'unda çalıştırıp çıktıyı beklenen XML ile karşılaştırır.
//   node test/run.mjs            -> test/fixtures/*.htm için karşılaştırma
//   node test/run.mjs --update   -> beklenen çıktıları (test/expected) yeniden yazar
// test/private/*.htm (git'e girmez) varsa, çıktıları test/private/out/ altına yazar.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const libs = ['matweb-parser.js', 'xml-writer.js'].map((f) => path.join(here, '..', 'extension', 'lib', f));
const update = process.argv.includes('--update');

function htmFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f)).map((f) => path.join(dir, f));
}

async function convert(page, file) {
  // Kaydedilmiş sayfalardaki betik/stil dosyaları test için gereksiz; ağ isteklerini kes.
  await page.route('**/*', (route) => (route.request().url() === pathToFileURL(file).href ? route.continue() : route.abort()));
  await page.goto(pathToFileURL(file).href);
  for (const lib of libs) await page.addScriptTag({ path: lib });
  return page.evaluate(() => {
    const data = MatwebParser.parseDatasheet(document);
    const xml = MatwebXml.toXml(data, { sourceUrl: 'https://www.matweb.com/test' });
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const err = parsed.querySelector('parsererror');
    return { xml, fileName: MatwebXml.fileNameFor(data.name), wellFormed: !err, error: err && err.textContent };
  });
}

const browser = await chromium.launch();
let failed = 0;
try {
  const expectedDir = path.join(here, 'expected');
  fs.mkdirSync(expectedDir, { recursive: true });

  for (const file of htmFiles(path.join(here, 'fixtures'))) {
    const page = await browser.newPage();
    const out = await convert(page, file);
    await page.close();
    const expFile = path.join(expectedDir, path.basename(file).replace(/\.html?$/i, '.xml'));
    const label = path.basename(file);
    if (!out.wellFormed) {
      failed++;
      console.log(`HATA  ${label}: XML geçerli değil: ${out.error}`);
    } else if (update || !fs.existsSync(expFile)) {
      fs.writeFileSync(expFile, out.xml);
      console.log(`YAZILDI ${label} -> ${path.relative(here, expFile)}`);
    } else if (fs.readFileSync(expFile, 'utf8') !== out.xml) {
      failed++;
      console.log(`HATA  ${label}: çıktı ${path.relative(here, expFile)} ile uyuşmuyor`);
    } else {
      console.log(`TAMAM ${label}`);
    }
  }

  const privDir = path.join(here, 'private');
  const privFiles = htmFiles(privDir);
  if (privFiles.length) fs.mkdirSync(path.join(privDir, 'out'), { recursive: true });
  for (const file of privFiles) {
    const page = await browser.newPage();
    const out = await convert(page, file);
    await page.close();
    const dest = path.join(privDir, 'out', out.fileName);
    fs.writeFileSync(dest, out.xml);
    if (!out.wellFormed) failed++;
    console.log(`${out.wellFormed ? 'ÖZEL ' : 'HATA '} ${path.basename(file)} -> private/out/${out.fileName}`);
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
