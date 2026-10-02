// Araç çubuğu paneli: etkin MatWeb sayfasını okur, malzemeyi kütüphaneye (storage.local) ekler,
// kütüphaneyi tek bir ANSYS Engineering Data XML dosyası olarak indirir.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const LIBRARY_FILE = 'MatWeb_ANSYS_Kutuphanesi.xml';
const $ = (id) => document.getElementById(id);

let current = null; // { data, sourceUrl }
let library = [];
let autoUpdate = true;

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

async function loadState() {
  const s = await api.storage.local.get({ library: [], autoUpdate: true });
  library = s.library;
  autoUpdate = s.autoUpdate;
}

async function saveLibrary() {
  await api.storage.local.set({ library });
}

function render() {
  const list = $('list');
  list.textContent = '';
  library.forEach((m) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = m.name;
    name.title = m.sourceUrl || m.name;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Kütüphaneden çıkar';
    del.addEventListener('click', () => removeMaterial(m.uid));
    li.append(name, del);
    list.append(li);
  });
  $('count').textContent = library.length ? `(${library.length})` : '';
  $('empty').hidden = library.length > 0;
  $('download').disabled = !library.length;
  $('clear').disabled = !library.length;
  $('auto').checked = autoUpdate;

  const known = current && library.some((m) => m.key === materialKey(current));
  $('add').textContent = known ? 'Kütüphanede güncelle' : 'Kütüphaneye ekle';
}

function materialKey(c) {
  return c.data.matGuid || c.sourceUrl;
}

async function download(xml, filename, overwrite) {
  const res = await api.runtime.sendMessage({ type: 'download', xml, filename, overwrite });
  if (!res || !res.ok) throw new Error((res && res.error) || 'İndirme başlatılamadı');
}

async function downloadLibrary() {
  const xml = MatwebAnsys.toAnsysXml(library, { versionDate: MatwebAnsys.versionDate(new Date()) });
  await download(xml, LIBRARY_FILE, true);
}

async function addCurrent() {
  if (!current) return;
  const key = materialKey(current);
  const existing = library.find((m) => m.key === key);
  const entry = {
    uid: existing ? existing.uid : crypto.randomUUID(),
    key,
    name: displayName(current.data.name),
    sourceUrl: current.sourceUrl,
    addedAt: new Date().toISOString(),
    data: current.data
  };
  if (existing) library[library.indexOf(existing)] = entry;
  else library.push(entry);
  await saveLibrary();
  render();
  const what = existing ? 'güncellendi' : 'eklendi';
  if (autoUpdate) {
    await downloadLibrary();
    setStatus(`“${entry.name}” ${what}; kütüphane dosyası yazıldı.`, 'ok');
  } else {
    setStatus(`“${entry.name}” ${what}.`, 'ok');
  }
}

async function removeMaterial(uid) {
  library = library.filter((m) => m.uid !== uid);
  await saveLibrary();
  render();
  if (autoUpdate && library.length) await downloadLibrary();
  setStatus('Malzeme çıkarıldı.', 'ok');
}

let clearArmed = false;
async function clearLibrary() {
  // Firefox panellerinde confirm() çalışmadığı için iki tıklamalı onay.
  if (!clearArmed) {
    clearArmed = true;
    $('clear').textContent = 'Emin misiniz?';
    setTimeout(() => {
      clearArmed = false;
      $('clear').textContent = 'Temizle';
    }, 3000);
    return;
  }
  library = [];
  await saveLibrary();
  render();
  setStatus('Kütüphane temizlendi.', 'ok');
}

async function exportCurrent() {
  const xml = MatwebXml.toXml(current.data, { sourceUrl: current.sourceUrl, exportedAt: new Date().toISOString() });
  await download(xml, MatwebXml.fileNameFor(current.data.name), false);
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
$('download').addEventListener('click', guard(async () => {
  await downloadLibrary();
  setStatus('ANSYS kütüphanesi indirildi.', 'ok');
}));
$('clear').addEventListener('click', guard(clearLibrary));
$('auto').addEventListener('change', guard(async () => {
  autoUpdate = $('auto').checked;
  await api.storage.local.set({ autoUpdate });
}));

guard(async () => {
  await loadState();
  render();
  await readActiveTab();
  render();
})();
