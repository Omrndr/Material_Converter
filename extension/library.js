// Kütüphane sayfası: malzemeleri listeler (arama, sıralama, seçim), seçilenleri ayrı XML olarak indirir
// veya kaldırır; "Kurulum ve ayarlar" sekmesinde kütüphane dosyasının konumunu ayarlar.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

let settings = null;
const selected = new Set();

function guard(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      console.error(e);
      UI.toast('Hata: ' + (e && e.message ? e.message : e), 'err');
    }
  };
}

// --- Sekmeler (#malzemeler / #kurulum) ---
function showView() {
  const view = location.hash === '#kurulum' ? 'kurulum' : 'malzemeler';
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + view; });
  document.querySelectorAll('.tab').forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  window.scrollTo(0, 0);
}

// --- Kütüphane dosyası bilgisi ---
function renderFile() {
  const path = 'İndirilenler/' + MatStore.libraryPath(settings);
  $('file-path').textContent = path;
  $('setup-path').textContent = path;
  const parts = [settings.autoUpdate ? 'Malzeme eklenip kaldırıldıkça otomatik güncellenir' : 'Otomatik güncelleme kapalı'];
  parts.push(settings.lastWrittenAt ? 'Son güncelleme: ' + UI.formatDate(settings.lastWrittenAt) : 'Henüz oluşturulmadı');
  $('file-meta').textContent = parts.join(' · ');
}

function renderSettingsForm() {
  $('folder').value = settings.folder;
  $('file-name').value = settings.fileName;
  $('auto').checked = settings.autoUpdate;
  updatePathPreview();
}

function updatePathPreview() {
  $('path-preview').textContent = 'İndirilenler/' + MatStore.libraryPath({ folder: $('folder').value, fileName: $('file-name').value });
}

// --- Liste ---
function visibleEntries() {
  const q = $('search').value.trim().toLocaleLowerCase('tr');
  const list = q
    ? settings.library.filter((m) => (m.name + ' ' + (m.data.categories || []).join(' ')).toLocaleLowerCase('tr').includes(q))
    : settings.library;
  return MatStore.sortEntries(list, settings.sort);
}

function statusCell(m) {
  const td = document.createElement('td');
  const box = document.createElement('div');
  box.className = 'status';
  const props = MatStore.ansysProperties(m.data);
  const warnings = MatStore.warningsFor(m.data);
  const chip = document.createElement('span');
  if (warnings.length) {
    chip.className = 'chip warn';
    chip.append(UI.icon('alert'), `${props.length} özellik · dikkat`);
  } else {
    chip.className = 'chip ok';
    chip.append(UI.icon('check'), `Hazır · ${props.length} özellik`);
  }
  chip.title = props.length ? "ANSYS'e aktarılan özellikler:\n" + props.join('\n') : "ANSYS'e aktarılan özellik yok";
  box.append(chip);
  warnings.forEach((w) => {
    const d = document.createElement('div');
    d.className = 'detail';
    d.textContent = w;
    box.append(d);
  });
  td.append(box);
  return td;
}

function render() {
  const uids = new Set(settings.library.map((m) => m.uid));
  [...selected].forEach((u) => uids.has(u) || selected.delete(u));

  const entries = visibleEntries();
  const tbody = $('rows');
  tbody.textContent = '';
  entries.forEach((m) => {
    const tr = document.createElement('tr');
    tr.classList.toggle('selected', selected.has(m.uid));

    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(m.uid);
    cb.setAttribute('aria-label', m.name + ' seç');
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(m.uid);
      else selected.delete(m.uid);
      tr.classList.toggle('selected', cb.checked);
      renderSelection(entries);
    });
    tdCheck.append(cb);

    const tdName = document.createElement('td');
    const a = document.createElement('a');
    a.className = 'mat-name';
    a.href = m.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = 'MatWeb sayfasını yeni sekmede aç';
    a.append(m.name, UI.icon('external'));
    const cat = document.createElement('div');
    cat.className = 'mat-cat';
    cat.textContent = (m.data.categories || []).slice(-2).join(' · ');
    tdName.append(a, cat);

    const tdDate = document.createElement('td');
    tdDate.className = 'date';
    tdDate.textContent = UI.formatDate(m.addedAt);
    if (m.updatedAt && m.updatedAt !== m.addedAt) tdDate.title = 'Son güncelleme: ' + UI.formatDate(m.updatedAt);

    const tdAct = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.title = 'Kütüphaneden kaldır';
    del.setAttribute('aria-label', m.name + ' kütüphaneden kaldır');
    del.append(UI.icon('trash'));
    del.addEventListener('click', guard(() => {
      if (confirm(`"${m.name}" kütüphaneden kaldırılsın mı?`)) return removeEntries([m.uid]);
    }));
    tdAct.append(del);

    tr.append(tdCheck, tdName, statusCell(m), tdDate, tdAct);
    tbody.append(tr);
  });

  const total = settings.library.length;
  $('tab-count').textContent = total || '';
  $('table').hidden = total === 0 || entries.length === 0;
  $('toolbar').hidden = total === 0;
  $('empty').hidden = total > 0;
  $('no-match').hidden = !total || entries.length > 0;
  $('write-library').disabled = total === 0;
  $('sort').value = `${settings.sort.key}:${settings.sort.dir}`;
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === settings.sort.key);
    th.dataset.dir = th.dataset.sort === settings.sort.key ? settings.sort.dir : '';
  });
  renderSelection(entries);
  renderFile();
}

function renderSelection(entries) {
  const n = selected.size;
  $('selection-bar').hidden = n === 0;
  $('selection-count').textContent = n;
  const visibleSelected = entries.filter((m) => selected.has(m.uid)).length;
  $('select-all').checked = entries.length > 0 && visibleSelected === entries.length;
  $('select-all').indeterminate = visibleSelected > 0 && visibleSelected < entries.length;
}

// --- İşlemler ---
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
  if (settings.autoUpdate && settings.library.length) await MatStore.writeLibrary(settings);
  render();
  UI.toast(`${uids.length} malzeme kütüphaneden kaldırıldı.` + (settings.autoUpdate ? ' ANSYS dosyası güncellendi.' : ''));
}

async function downloadSelected() {
  // Seçim, listedeki sırayla dosyaya yazılır.
  const entries = MatStore.sortEntries(settings.library, settings.sort).filter((m) => selected.has(m.uid));
  const folder = MatStore.sanitizeFolder(settings.folder);
  const path = (folder ? folder + '/' : '') + `MatWeb_Secim_${MatStore.stamp(new Date())}.xml`;
  await MatStore.download(MatStore.toAnsysXml(entries), path, false);
  UI.toast(`${entries.length} malzemelik dosya indirildi: İndirilenler/${path}`);
}

async function saveSettings() {
  settings.folder = MatStore.sanitizeFolder($('folder').value);
  settings.fileName = MatStore.sanitizeFileName($('file-name').value);
  settings.autoUpdate = $('auto').checked;
  await MatStore.save({ folder: settings.folder, fileName: settings.fileName, autoUpdate: settings.autoUpdate });
  renderSettingsForm();
  renderFile();
  UI.toast('Ayarlar kaydedildi. Dosyayı oluşturmak için Malzemeler sekmesinde “Şimdi güncelle”ye basın.');
}

// --- Olaylar ---
window.addEventListener('hashchange', showView);
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
$('clear-selection').addEventListener('click', () => {
  selected.clear();
  render();
});
$('download-selected').addEventListener('click', guard(downloadSelected));
$('remove-selected').addEventListener('click', guard(() => {
  if (confirm(`${selected.size} malzeme kütüphaneden kaldırılsın mı?`)) return removeEntries([...selected]);
}));
$('write-library').addEventListener('click', guard(async () => {
  const path = await MatStore.writeLibrary(settings);
  renderFile();
  UI.toast(`ANSYS kütüphane dosyası güncellendi: İndirilenler/${path}`);
}));
$('folder').addEventListener('input', updatePathPreview);
$('file-name').addEventListener('input', updatePathPreview);
$('save-settings').addEventListener('click', guard(saveSettings));

// Panelden malzeme eklenince liste kendiliğinden yenilenir (kaydedilmemiş form alanlarına dokunulmaz).
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !settings) return;
  ['library', 'sort', 'lastWrittenAt'].forEach((k) => {
    if (changes[k]) settings[k] = changes[k].newValue;
  });
  render();
});

UI.hydrate();
showView();
guard(async () => {
  settings = await MatStore.load();
  renderSettingsForm();
  render();
})();
