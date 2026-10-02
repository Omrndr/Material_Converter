// Araç çubuğu paneli: açık MatWeb sayfasındaki malzemeyi kütüphaneye ekler; kütüphanenin özetini gösterir.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

let current = null; // { data, sourceUrl }
let settings = null;

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

function showState(name) {
  ['loading', 'empty', 'nodata', 'material'].forEach((s) => {
    $('state-' + s).hidden = s !== name;
  });
}

function renderLibrary() {
  $('count').textContent = settings.library.length;
  const folder = MatStore.sanitizeFolder(settings.folder);
  $('path-file').textContent = MatStore.sanitizeFileName(settings.fileName);
  $('path-dir').textContent = 'Klasör: İndirilenler' + (folder ? '/' + folder : '');
  const meta = $('file-meta');
  meta.textContent = '';
  const parts = [];
  if (!settings.autoUpdate) parts.push('Otomatik güncelleme kapalı');
  else parts.push('Her eklemede otomatik güncellenir');
  if (settings.lastWrittenAt) parts.push('son: ' + UI.formatDate(settings.lastWrittenAt));
  meta.append(parts.join(' · ') + ' · ');
  const change = document.createElement('a');
  change.href = '#';
  change.textContent = 'Konumu değiştir';
  change.addEventListener('click', (e) => {
    e.preventDefault();
    openTab(api.runtime.getURL('library.html#kurulum'));
  });
  meta.append(change);
}

function renderMaterial() {
  if (!current) return;
  const data = current.data;
  $('mat-name').textContent = displayName(data.name);
  $('mat-category').textContent = (data.categories || []).slice(-2).join(' · ');

  const existing = settings.library.find((m) => m.key === materialKey(current));
  const status = $('mat-status');
  status.textContent = '';
  if (existing) {
    status.className = 'chip ok';
    status.append(UI.icon('check'), 'Kütüphanede · ' + UI.formatDate(existing.updatedAt || existing.addedAt, false));
  } else {
    status.className = 'chip';
    status.textContent = 'Kütüphanede değil';
  }

  const props = MatStore.ansysProperties(data);
  const chip = $('mat-props');
  chip.className = props.length ? 'chip info' : 'chip warn';
  chip.textContent = props.length ? `ANSYS'e ${props.length} özellik aktarılır` : "ANSYS'e aktarılacak özellik yok";
  chip.title = props.join('\n');

  const groupBox = $('mat-groups');
  groupBox.textContent = '';
  if (existing) {
    settings.groups.filter((g) => g.members.includes(existing.uid)).forEach((g) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.title = 'Kategori';
      c.append(UI.icon('folder'), g.name);
      groupBox.append(c);
    });
  }

  const box = $('page-warnings');
  box.textContent = '';
  MatStore.warningsFor(data).forEach((w) => {
    const div = document.createElement('div');
    div.className = 'notice';
    div.append(UI.icon('alert'), w);
    box.append(div);
  });

  const add = $('add');
  add.textContent = existing ? 'Kütüphanede güncelle' : 'Kütüphaneye ekle';
  add.dataset.icon = existing ? 'refresh' : 'plus';
  UI.hydrate(add.parentElement);
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
  // Kategori dosyaları otomatik yazılmaz; malzemeyi içeren kategoriler "güncel değil" olarak işaretlenir.
  if (existing) MatStore.markGroupsChanged(settings, [entry.uid]);
  await MatStore.save({ library, groups: settings.groups });
  if (settings.autoUpdate) await MatStore.writeLibrary(settings);
  renderMaterial();
  renderLibrary();
  const what = existing ? 'güncellendi' : 'kütüphaneye eklendi';
  UI.toast(`${entry.name} ${what}.` + (settings.autoUpdate ? ' ANSYS dosyası güncellendi.' : ''));
}

async function exportCurrent() {
  const xml = MatwebXml.toXml(current.data, {
    sourceUrl: MatStore.cleanSourceUrl(current.sourceUrl),
    exportedAt: new Date().toISOString()
  });
  const name = MatwebXml.fileNameFor(current.data.name);
  await MatStore.download(xml, name, false);
  UI.toast(`İndirilenler/${name} indirildi.`);
}

async function readActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || !isMatweb(tab.url)) return showState('empty');
  await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/matweb-parser.js'] });
  const [{ result }] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.MatwebParser.parseDatasheet(document)
  });
  if (!result || !result.groups.length) return showState('nodata');
  current = { data: result, sourceUrl: tab.url };
  renderMaterial();
  showState('material');
}

function guard(fn) {
  return async () => {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      UI.toast('Hata: ' + (e && e.message ? e.message : e), 'err');
    }
  };
}

$('add').addEventListener('click', guard(addCurrent));
$('export-one').addEventListener('click', guard(exportCurrent));
$('open-library').addEventListener('click', () => openTab(api.runtime.getURL('library.html')));
$('matweb-link').addEventListener('click', (e) => {
  e.preventDefault();
  openTab('https://www.matweb.com/');
});

UI.hydrate();
guard(async () => {
  settings = await MatStore.load();
  renderLibrary();
  await readActiveTab();
})();
