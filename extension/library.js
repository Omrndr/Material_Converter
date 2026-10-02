// Kütüphane sayfası: tüm malzemeleri listeler, arama/sıralama, seçili malzemeleri ayrı XML olarak
// indirme ve silme, kütüphane dosyasının konum ayarı.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

let settings = null;
const selected = new Set();
let statusTimer = null;

function setStatus(text, kind) {
  $('status').textContent = text || '';
  $('status').className = kind || '';
  clearTimeout(statusTimer);
  if (kind === 'ok') statusTimer = setTimeout(() => setStatus(''), 6000);
}

function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      console.error(e);
      setStatus('Hata: ' + (e && e.message ? e.message : e), 'err');
    }
  };
}

function formatDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function visibleEntries() {
  const q = $('search').value.trim().toLocaleLowerCase('tr');
  const list = q
    ? settings.library.filter((m) => (m.name + ' ' + (m.data.categories || []).join(' ')).toLocaleLowerCase('tr').includes(q))
    : settings.library;
  return MatStore.sortEntries(list, settings.sort);
}

function renderSettings() {
  $('folder').value = settings.folder;
  $('file-name').value = settings.fileName;
  $('auto').checked = settings.autoUpdate;
  updatePathPreview();
}

function updatePathPreview() {
  $('path-preview').textContent = 'İndirilenler/' + MatStore.libraryPath({ folder: $('folder').value, fileName: $('file-name').value });
}

function render() {
  // Silinmiş malzemeler seçimden düşer.
  const uids = new Set(settings.library.map((m) => m.uid));
  [...selected].forEach((u) => uids.has(u) || selected.delete(u));

  const entries = visibleEntries();
  const tbody = $('rows');
  tbody.textContent = '';
  entries.forEach((m) => {
    const tr = document.createElement('tr');

    const tdCheck = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(m.uid);
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(m.uid);
      else selected.delete(m.uid);
      updateSelectionUi(entries);
    });
    tdCheck.append(cb);

    const tdName = document.createElement('td');
    const a = document.createElement('a');
    a.href = m.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = m.name;
    a.title = 'MatWeb sayfasını yeni sekmede aç';
    tdName.append(a);

    const tdCat = document.createElement('td');
    tdCat.textContent = MatStore.category(m);

    const tdDate = document.createElement('td');
    tdDate.textContent = formatDate(m.addedAt);
    if (m.updatedAt && m.updatedAt !== m.addedAt) tdDate.title = 'Son güncelleme: ' + formatDate(m.updatedAt);

    const tdWarn = document.createElement('td');
    tdWarn.className = 'warn';
    MatStore.warningsFor(m.data).forEach((w) => {
      const div = document.createElement('div');
      div.textContent = '⚠ ' + w;
      tdWarn.append(div);
    });

    const tdDel = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'icon';
    del.textContent = '✕';
    del.title = 'Kütüphaneden çıkar';
    del.addEventListener('click', guard(() => removeEntries([m.uid])));
    tdDel.append(del);

    tr.append(tdCheck, tdName, tdCat, tdDate, tdWarn, tdDel);
    tbody.append(tr);
  });

  const total = settings.library.length;
  $('count').textContent = total ? `${total} malzeme` : '';
  $('empty').hidden = total > 0;
  $('no-match').hidden = !total || entries.length > 0;
  $('sort').value = `${settings.sort.key}:${settings.sort.dir}`;
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === settings.sort.key);
    th.dataset.dir = th.dataset.sort === settings.sort.key ? settings.sort.dir : '';
  });
  updateSelectionUi(entries);
}

function updateSelectionUi(entries) {
  const n = selected.size;
  $('download-selected').disabled = !n;
  $('remove-selected').disabled = !n;
  $('download-selected').textContent = n ? `Seçilileri XML indir (${n})` : 'Seçilileri XML indir';
  const visibleSelected = entries.filter((m) => selected.has(m.uid)).length;
  $('select-all').checked = entries.length > 0 && visibleSelected === entries.length;
  $('select-all').indeterminate = visibleSelected > 0 && visibleSelected < entries.length;
}

async function setSort(key, dir) {
  settings.sort = { key, dir };
  await MatStore.save({ sort: settings.sort });
  render();
}

async function removeEntries(uids) {
  const drop = new Set(uids);
  settings.library = settings.library.filter((m) => !drop.has(m.uid));
  uids.forEach((u) => selected.delete(u));
  await MatStore.save({ library: settings.library });
  render();
  if (settings.autoUpdate && settings.library.length) {
    const path = await MatStore.writeLibrary(settings);
    setStatus(`${uids.length} malzeme silindi; İndirilenler/${path} güncellendi.`, 'ok');
  } else {
    setStatus(`${uids.length} malzeme silindi.`, 'ok');
  }
}

let removeArmed = false;
async function removeSelected() {
  // Yanlışlıkla toplu silmeyi önlemek için iki tıklamalı onay.
  if (!removeArmed) {
    removeArmed = true;
    $('remove-selected').textContent = `${selected.size} malzeme silinsin mi? Tekrar tıklayın`;
    setTimeout(() => {
      removeArmed = false;
      $('remove-selected').textContent = 'Seçilileri sil';
    }, 4000);
    return;
  }
  removeArmed = false;
  $('remove-selected').textContent = 'Seçilileri sil';
  await removeEntries([...selected]);
}

async function downloadSelected() {
  // Seçim, ekrandaki sırayla dosyaya yazılır.
  const entries = MatStore.sortEntries(settings.library, settings.sort).filter((m) => selected.has(m.uid));
  const folder = MatStore.sanitizeFolder(settings.folder);
  const path = (folder ? folder + '/' : '') + `MatWeb_Secim_${MatStore.stamp(new Date())}.xml`;
  await MatStore.download(MatStore.toAnsysXml(entries), path, false);
  setStatus(`${entries.length} malzeme İndirilenler/${path} olarak indirildi.`, 'ok');
}

async function saveSettings() {
  settings.folder = MatStore.sanitizeFolder($('folder').value);
  settings.fileName = MatStore.sanitizeFileName($('file-name').value);
  settings.autoUpdate = $('auto').checked;
  await MatStore.save({ folder: settings.folder, fileName: settings.fileName, autoUpdate: settings.autoUpdate });
  renderSettings();
  setStatus('Ayarlar kaydedildi. Kütüphane dosyası: İndirilenler/' + MatStore.libraryPath(settings), 'ok');
}

$('search').addEventListener('input', render);
$('sort').addEventListener('change', guard(() => {
  const [key, dir] = $('sort').value.split(':');
  return setSort(key, dir);
}));
document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', guard(() => {
    const key = th.dataset.sort;
    const dir = settings.sort.key === key && settings.sort.dir === 'asc' ? 'desc' : 'asc';
    return setSort(key, dir);
  }));
});
$('select-all').addEventListener('change', () => {
  visibleEntries().forEach((m) => ($('select-all').checked ? selected.add(m.uid) : selected.delete(m.uid)));
  render();
});
$('download-selected').addEventListener('click', guard(downloadSelected));
$('remove-selected').addEventListener('click', guard(removeSelected));
$('folder').addEventListener('input', updatePathPreview);
$('file-name').addEventListener('input', updatePathPreview);
$('save-settings').addEventListener('click', guard(saveSettings));
$('write-library').addEventListener('click', guard(async () => {
  if (!settings.library.length) return setStatus('Kütüphane boş.', 'err');
  const path = await MatStore.writeLibrary(settings);
  setStatus(`İndirilenler/${path} yazıldı.`, 'ok');
}));

// Panelden malzeme eklenince liste kendiliğinden yenilenir.
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  Object.keys(changes).forEach((k) => {
    if (k in settings && k !== 'folder' && k !== 'fileName' && k !== 'autoUpdate') settings[k] = changes[k].newValue;
  });
  render();
});

guard(async () => {
  settings = await MatStore.load();
  renderSettings();
  render();
})();
