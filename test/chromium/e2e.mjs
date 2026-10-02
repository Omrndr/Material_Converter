// Chrome/Edge paketinin (dist/chromium) gerçek Chromium'da uçtan uca testi.
//
// Chromium'da araç çubuğu düğmesine otomatik tıklanamadığından bu test, eklentiye MatWeb için site izni
// eklenmiş bir kopyasını kullanır ve paneli (popup.html) ayrı sekmede açar. Sayfa okuma, service worker +
// offscreen belge ile indirme, alt klasör/üzerine yazma, kütüphane sayfası ve kategoriler gerçek tarayıcıda çalışır.
//
//   node scripts/build.mjs --no-zip && xvfb-run -a node test/chromium/e2e.mjs
//   (CHROMIUM_BIN ile tarayıcı yolu değiştirilebilir)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const CHROMIUM = process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LIBRARY = 'MatWeb_ANSYS_Kutuphanesi.xml';
const PAGES = { ['a'.repeat(32)]: 'fixtures/conditional.htm', ['b'.repeat(32)]: 'fixtures/overview.htm' };

let failures = 0;
const check = (cond, label) => {
  if (!cond) failures++;
  console.log((cond ? 'TAMAM ' : 'HATA  ') + label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error('Zaman aşımı: ' + label);
}

function materialNames(file) {
  const xml = fs.readFileSync(file, 'utf8');
  return [...xml.matchAll(/<BulkDetails>\s*<Name>([^<]*)<\/Name>/g)].map((m) => m[1]);
}

// www.matweb.com'u taklit eden sunucu (tarayıcı --host-resolver-rules ile buraya yönlendirilir).
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://www.matweb.com');
  const guid = [...u.searchParams].find(([k]) => k.toLowerCase() === 'matguid')?.[1];
  const file = PAGES[guid];
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(fs.readFileSync(path.join(here, '..', file)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// Test kopyası: MatWeb için site izni (araç çubuğu tıklamasının verdiği activeTab izninin yerine).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-chromium-'));
const ext = path.join(tmp, 'ext');
fs.cpSync(path.join(root, 'dist', 'chromium'), ext, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['http://www.matweb.com/*'];
fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));

const downloads = path.join(tmp, 'downloads');
const profile = path.join(tmp, 'profile');
fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
fs.mkdirSync(downloads);
fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({
  download: { default_directory: downloads, prompt_for_download: false, directory_upgrade: true },
  savefile: { default_directory: downloads }
}));

// Playwright'ın otomasyon için kullandığı Chromium anahtarları (eklentileri kapatan hariç). Bunlar olmadan
// Chromium, yerel sahte sunucuya yönlendirilen www.matweb.com isteğini HTTPS yükseltmesi vb. nedeniyle engelliyor.
const AUTOMATION_SWITCHES = [
  '--disable-field-trial-config', '--disable-background-networking', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-back-forward-cache', '--disable-breakpad',
  '--disable-client-side-phishing-detection', '--disable-component-extensions-with-background-pages',
  '--disable-component-update', '--no-default-browser-check', '--disable-default-apps', '--disable-dev-shm-usage',
  '--disable-features=AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,' +
    'DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,' +
    'ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument',
  '--allow-pre-commit-input', '--disable-hang-monitor', '--disable-ipc-flooding-protection', '--disable-popup-blocking',
  '--disable-prompt-on-repost', '--disable-renderer-backgrounding', '--force-color-profile=srgb', '--metrics-recording-only',
  '--no-first-run', '--password-store=basic', '--use-mock-keychain', '--no-service-autorun', '--disable-search-engine-choice-screen'
];

const debugPort = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(CHROMIUM, [
  `--user-data-dir=${profile}`,
  `--load-extension=${ext}`,
  `--disable-extensions-except=${ext}`,
  `--remote-debugging-port=${debugPort}`,
  `--host-resolver-rules=MAP www.matweb.com 127.0.0.1:${port}`,
  ...AUTOMATION_SWITCHES,
  '--no-proxy-server', '--no-sandbox', 'about:blank'
], { stdio: 'ignore' });

let browser;
try {
  browser = await waitFor(() => chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`).catch(() => null), 'Chromium başlatma', 20000);
  const context = browser.contexts()[0];
  // Playwright bağlanınca indirmeleri kendi geçici klasörüne yönlendirir; Chrome'un kendi davranışına
  // (profildeki İndirilenler klasörü, eklentinin verdiği alt klasör ve dosya adı) geri dön.
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
  // İlk kurulumda kurulum sayfası açılır; eklenti kimliği bu sekmenin adresinden alınır
  // (service worker boşta kalınca kapandığı için ona güvenilmez).
  const setup = await waitFor(() => context.pages().find((p) => p.url().startsWith('chrome-extension://')), 'kurulum sekmesi', 20000);
  const extId = new URL(setup.url()).host;
  console.log('Chromium', browser.version(), '| eklenti', extId);
  const extUrl = (p) => `chrome-extension://${extId}/${p}`;
  check(setup.url().endsWith('#kurulum'), 'ilk kurulumda "Kurulum ve ayarlar" sayfası açıldı');
  await setup.close();

  // Panel sekmede açılır; "etkin sekme" olarak MatWeb sekmesi kullanılır.
  await context.addInitScript(() => {
    if (location.protocol === 'chrome-extension:' && location.pathname.endsWith('/popup.html')) {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = () => query({ url: 'http://www.matweb.com/*' });
      window.close = () => {};
    }
  });
  const matweb = await context.newPage();
  const openPopup = async () => {
    const p = await context.newPage();
    await p.goto(extUrl('popup.html'));
    await p.waitForFunction(() => document.getElementById('state-loading').hidden);
    return p;
  };
  const popupState = (p) => p.evaluate(() => ({
    state: ['empty', 'nodata', 'material'].find((s) => !document.getElementById('state-' + s).hidden),
    name: document.getElementById('mat-name').textContent,
    inLibrary: document.getElementById('mat-status').classList.contains('ok'),
    warnings: document.querySelectorAll('#page-warnings .notice').length,
    count: document.getElementById('count').textContent,
    toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent
  }));

  await matweb.goto(`http://www.matweb.com/search/DataSheet.aspx?MatGUID=${'a'.repeat(32)}`);
  let popup = await openPopup();
  let st = await popupState(popup);
  check(st.state === 'material' && st.name === 'Test Alloy T6; T651' && !st.inLibrary, 'MatWeb sayfası Chromium\'da okundu');
  await popup.click('#add');
  await waitFor(async () => (await popupState(popup)).toast, 'ekleme bildirimi');
  st = await popupState(popup);
  check(st.inLibrary && st.count === '1' && st.toast.includes('eklendi'), 'malzeme eklendi: ' + st.toast);
  const libFile = path.join(downloads, LIBRARY);
  await waitFor(() => fs.existsSync(libFile), 'kütüphane dosyası');
  check(materialNames(libFile).join() === 'Test Alloy T6; T651', 'service worker + offscreen ile ANSYS dosyası indirildi');
  await popup.close();

  await matweb.goto(`http://www.matweb.com/search/DataSheet.aspx?MatGUID=${'b'.repeat(32)}`);
  popup = await openPopup();
  st = await popupState(popup);
  check(st.name === 'Test Steel' && st.warnings === 1, 'Overview sayfası uyarısı gösterildi');
  await popup.click('#add');
  await waitFor(async () => (await popupState(popup)).count === '2', 'ikinci malzeme');
  await waitFor(() => fs.existsSync(libFile) && materialNames(libFile).length === 2, 'kütüphane güncellemesi');
  check(materialNames(libFile).join('|') === 'Test Alloy T6; T651|Test Steel', 'aynı dosyanın üzerine yazıldı (kopya oluşmadı)');
  await popup.click('#export-one');
  await waitFor(() => fs.existsSync(path.join(downloads, 'Test_Steel.xml')), 'genel XML');
  check(true, 'tüm veri ayrı XML olarak indirildi');
  const badge = await popup.evaluate(() => chrome.action.getBadgeText({}));
  check(badge === '2', 'rozet: ' + badge);
  await popup.close();
  check(fs.readdirSync(downloads).sort().join() === [LIBRARY, 'Test_Steel.xml'].join(), 'İndirilenler: ' + fs.readdirSync(downloads).join(', '));

  // Kütüphane sayfası
  const lib = await context.newPage();
  lib.on('dialog', (d) => d.accept());
  await lib.goto(extUrl('library.html'));
  await lib.waitForSelector('#rows tr');
  const names = () => lib.$$eval('#rows a.mat-name', (as) => as.map((a) => a.textContent));
  check((await names()).join('|') === 'Test Steel|Test Alloy T6; T651', 'kütüphane listesi');
  await lib.selectOption('#sort', 'name:asc');
  check((await names()).join('|') === 'Test Alloy T6; T651|Test Steel', 'ada göre sıralama');

  // Konum ayarı -> alt klasöre yazma
  await lib.click('a.tab[data-view="kurulum"]');
  await lib.fill('#folder', 'ANSYS/Kutuphane');
  await lib.click('#save-settings');
  await lib.click('a.tab[data-view="malzemeler"]');
  await lib.click('#write-library');
  const sub = path.join(downloads, 'ANSYS', 'Kutuphane');
  await waitFor(() => fs.existsSync(path.join(sub, LIBRARY)), 'alt klasör');
  check(materialNames(path.join(sub, LIBRARY)).length === 2, 'kütüphane ayarlanan alt klasöre yazıldı');

  // Kategori: seç -> Kategoriye ekle -> ad yaz + Enter -> otomatik indirilmez -> "indir" ile oluşur
  await lib.click('#select-all');
  await lib.click('#assign-group');
  await lib.fill('#assign-new-name', 'Hafif metaller');
  await lib.press('#assign-new-name', 'Enter');
  await waitFor(() => lib.evaluate(() => !document.getElementById('assign-dialog').open), 'pencere kapanması');
  const groups = await lib.$$eval('.group-item .name', (els) => els.map((e) => e.textContent));
  check(groups.includes('Hafif metaller'), 'Enter ile kategori oluştu');
  const gfile = path.join(sub, 'Hafif metaller.xml');
  await sleep(1000);
  check(!fs.existsSync(gfile), 'kategori dosyası otomatik indirilmedi');
  await lib.click('.group-item:has-text("Hafif metaller")');
  await lib.click('#write-group');
  await waitFor(() => fs.existsSync(gfile), 'kategori dosyası');
  check(materialNames(gfile).length === 2 && fs.readFileSync(gfile, 'utf8').includes('<Notes>Kategori: Hafif metaller</Notes>'),
    'kategori kendi adıyla ANSYS dosyasına indirildi');

  // Seçilenleri kaldır (onay penceresi kabul edilir)
  await lib.click('.group-item >> nth=0');
  await lib.click('#rows tr:first-child input[type=checkbox]');
  await lib.click('#remove-selected');
  await waitFor(async () => (await names()).length === 1, 'kaldırma');
  await waitFor(() => materialNames(path.join(sub, LIBRARY)).length === 1, 'kaldırma sonrası dosya');
  check((await names()).join() === 'Test Steel', 'seçilen malzeme kaldırıldı ve kütüphane dosyası güncellendi');
} catch (e) {
  failures++;
  console.log('HATA  ' + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  proc.kill();
  await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(failures ? `\n${failures} hata` : '\nTüm Chromium testleri geçti.');
process.exit(failures ? 1 : 0);
