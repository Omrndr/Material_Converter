// Araç çubuğu paneli: etkin MatWeb sayfasını okur, malzemeyi kütüphaneye ekler,
// son eklenenleri gösterir ve tam kütüphane sayfasını açar.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const RECENT_COUNT = 5;

let current = null; // { data, sourceUrl }
let settings = null;

function setStatus(text, kind) {
  $('status').textContent = text || '';
  $('status').className = kind || '';
}

function isMatweb(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && /(^|\.)matweb\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function displayName(name) {
  return (name || 'MatWeb malzemesi').replace(/^Overview of materials for\s+/i, '');
}

function materialKey(c) {
  return c.data.matGuid || MatStore.cleanSourceUrl(c.sourceUrl);
}

// Sekme açılmadan panel kapatılırsa istek yarıda kalabiliyor; önce açılmasını bekle.
async function openTab(url) {
  try {
    await api.tabs.create({ url });
  } finally {
    window.close();
  }
}

function render() {
  const library = settings.library;
  const list = $('list');
  list.textContent = '';
  MatStore.sortEntries(library, { key: 'addedAt', dir: 'desc' }).slice(0, RECENT_COUNT).forEach((m) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.textContent = m.name;
    a.href = m.sourceUrl;
    a.title = 'MatWeb sayfasını aç';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openTab(m.sourceUrl);
    });
    li.append(a);
    if (MatStore.warningsFor(m.data).length) {
      const w = document.createElement('span');
      w.className = 'warn-icon';
      w.textContent = '⚠';
      w.title = MatStore.warningsFor(m.data).join('\n');
      li.append(w);
    }
    list.append(li);
  });
  $('count').textContent = library.length ? `(toplam ${library.length})` : '';
  $('empty').hidden = library.length > 0;
  $('download').disabled = !library.length;
  $('path').textContent = 'Kütüphane dosyası: İndirilenler/' + MatStore.libraryPath(settings);

  const known = current && library.some((m) => m.key === materialKey(current));
  $('add').textContent = known ? 'Kütüphanede güncelle' : 'Kütüphaneye ekle';
}

function renderWarnings(warnings) {
  const ul = $('page-warnings');
  ul.textContent = '';
  warnings.forEach((w) => {
    const li = document.createElement('li');
    li.textContent = w;
    ul.append(li);
  });
}

async function addCurrent() {
  const key = materialKey(current);
  const library = settings.library;
  const existing = library.find((m) => m.key === key);
  const now = new Date().toISOString();
  const entry = {
    uid: existing ? existing.uid : crypto.randomUUID(),
    key,
    name: displayName(current.data.name),
    sourceUrl: MatStore.cleanSourceUrl(current.sourceUrl),
    addedAt: existing ? existing.addedAt : now,
    updatedAt: now,
    data: current.data
  };
  if (existing) library[library.indexOf(existing)] = entry;
  else library.push(entry);
  await MatStore.save({ library });
  render();
  const what = existing ? 'güncellendi' : 'eklendi';
  const warn = MatStore.warningsFor(entry.data).length ? ' (uyarıları kontrol edin)' : '';
  if (settings.autoUpdate) {
    const path = await MatStore.writeLibrary(settings);
    setStatus(`“${entry.name}” ${what}${warn}; İndirilenler/${path} güncellendi.`, warn ? 'warn' : 'ok');
  } else {
    setStatus(`“${entry.name}” ${what}${warn}.`, warn ? 'warn' : 'ok');
  }
}

async function exportCurrent() {
  const xml = MatwebXml.toXml(current.data, {
    sourceUrl: MatStore.cleanSourceUrl(current.sourceUrl),
    exportedAt: new Date().toISOString()
  });
  await MatStore.download(xml, MatwebXml.fileNameFor(current.data.name), false);
  setStatus('Genel XML indirildi.', 'ok');
}

async function readActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isMatweb(tab.url)) {
    $('page-name').textContent = 'Bu sekme bir MatWeb sayfası değil. Bir malzemenin veri sayfasını açın.';
    return;
  }
  await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/matweb-parser.js'] });
  const [{ result }] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.MatwebParser.parseDatasheet(document)
  });
  if (!result || !result.groups.length) {
    $('page-name').textContent = 'Bu sayfada MatWeb özellik tablosu bulunamadı.';
    return;
  }
  current = { data: result, sourceUrl: tab.url };
  $('page-name').textContent = displayName(result.name);
  $('page-name').className = '';
  renderWarnings(MatStore.warningsFor(result));
  $('add').disabled = false;
  $('export-one').disabled = false;
}

function guard(fn) {
  return async () => {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setStatus('Hata: ' + (e && e.message ? e.message : e), 'err');
    }
  };
}

$('add').addEventListener('click', guard(addCurrent));
$('export-one').addEventListener('click', guard(exportCurrent));
$('open-library').addEventListener('click', () => openTab(api.runtime.getURL('library.html')));
$('download').addEventListener('click', guard(async () => {
  const path = await MatStore.writeLibrary(settings);
  setStatus(`İndirilenler/${path} yazıldı.`, 'ok');
}));

guard(async () => {
  settings = await MatStore.load();
  render();
  await readActiveTab();
  render();
})();
