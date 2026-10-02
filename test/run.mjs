// Ayrıştırıcıyı ve XML yazıcılarını gerçek bir tarayıcı DOM'unda çalıştırıp çıktıyı beklenen XML ile karşılaştırır.
//   node test/run.mjs            -> test/fixtures/*.htm için karşılaştırma
//   node test/run.mjs --update   -> beklenen çıktıları (test/expected) yeniden yazar
// test/private/*.htm (git'e girmez) varsa, çıktıları test/private/out/ altına yazar.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const libs = ['matweb-parser.js', 'xml-writer.js', 'ansys-writer.js'].map((f) => path.join(here, '..', 'extension', 'lib', f));
const update = process.argv.includes('--update');
const expectedDir = path.join(here, 'expected');
let failed = 0;

function htmFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f)).sort().map((f) => path.join(dir, f));
}

async function withLibs(browser, url, fn, arg) {
  const page = await browser.newPage();
  try {
    // Kaydedilmiş sayfalardaki betik/stil dosyaları test için gereksiz; ağ isteklerini kes.
    await page.route('**/*', (route) => (route.request().url() === url ? route.continue() : route.abort()));
    await page.goto(url);
    for (const lib of libs) await page.addScriptTag({ path: lib });
    return await page.evaluate(fn, arg);
  } finally {
    await page.close();
  }
}

function parsePage(browser, file) {
  return withLibs(browser, pathToFileURL(file).href, () => {
    const data = MatwebParser.parseDatasheet(document);
    return { data, xml: MatwebXml.toXml(data, { sourceUrl: 'https://www.matweb.com/test' }), fileName: MatwebXml.fileNameFor(data.name) };
  });
}

// Kütüphane XML'i, sabit kimlik ve tarihle (karşılaştırılabilir olsun diye) üretilir.
function ansysLibrary(browser, entries) {
  return withLibs(browser, 'about:blank', (entries) =>
    MatwebAnsys.toAnsysXml(entries, { versionDate: '1/1/2026 12:00:00 PM' }), entries);
}

function wellFormedError(browser, xml) {
  return withLibs(browser, 'about:blank', (xml) => {
    const err = new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror');
    return err ? err.textContent : null;
  }, xml);
}

async function check(browser, label, xml, expFile) {
  const err = await wellFormedError(browser, xml);
  if (err) {
    failed++;
    console.log(`HATA  ${label}: XML geçerli değil: ${err}`);
  } else if (update || !fs.existsSync(expFile)) {
    fs.writeFileSync(expFile, xml);
    console.log(`YAZILDI ${label} -> ${path.relative(here, expFile)}`);
  } else if (fs.readFileSync(expFile, 'utf8') !== xml) {
    failed++;
    console.log(`HATA  ${label}: çıktı ${path.relative(here, expFile)} ile uyuşmuyor`);
  } else {
    console.log(`TAMAM ${label}`);
  }
}

function toEntries(results) {
  return results.map((r, i) => ({
    uid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name: r.data.name,
    sourceUrl: 'https://www.matweb.com/test',
    data: r.data
  }));
}

const browser = await chromium.launch();
try {
  fs.mkdirSync(expectedDir, { recursive: true });

  const results = [];
  for (const file of htmFiles(path.join(here, 'fixtures'))) {
    const r = await parsePage(browser, file);
    results.push(r);
    await check(browser, path.basename(file), r.xml, path.join(expectedDir, path.basename(file).replace(/\.html?$/i, '.xml')));
  }
  const lib = await ansysLibrary(browser, toEntries(results));
  await check(browser, 'ANSYS kütüphanesi', lib, path.join(expectedDir, 'ansys-library.xml'));

  const privDir = path.join(here, 'private');
  const privFiles = htmFiles(privDir);
  if (privFiles.length) {
    const outDir = path.join(privDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const priv = [];
    for (const file of privFiles) {
      const r = await parsePage(browser, file);
      priv.push(r);
      fs.writeFileSync(path.join(outDir, r.fileName), r.xml);
      console.log(`ÖZEL  ${path.basename(file)} -> private/out/${r.fileName}`);
    }
    const privLib = await ansysLibrary(browser, toEntries(priv));
    if (await wellFormedError(browser, privLib)) failed++;
    fs.writeFileSync(path.join(outDir, 'ANSYS_Kutuphane.xml'), privLib);
    console.log('ÖZEL  ANSYS kütüphanesi -> private/out/ANSYS_Kutuphane.xml');
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
