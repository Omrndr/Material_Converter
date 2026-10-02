// Kütüphane sayfası: malzemeleri listeler (arama, sıralama, seçim), kullanıcı kategorilerini yönetir,
// seçilenleri ayrı XML olarak indirir veya kaldırır; "Kurulum ve ayarlar" sekmesinde dosya konumunu ayarlar.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

let settings = null;
const selected = new Set();
let activeGroupId = ''; // '' = tüm malzemeler

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

function activeGroup() {
  return settings.groups.find((g) => g.id === activeGroupId) || null;
}

function groupsOf(uid) {
  return settings.groups.filter((g) => g.members.includes(uid));
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

// --- Kategoriler ---
function renderGroups() {
  if (activeGroupId && !activeGroup()) activeGroupId = '';
  const ul = $('group-list');
  ul.textContent = '';
  const item = (id, name, n, iconName) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'group-item' + (id === activeGroupId ? ' active' : '');
    btn.dataset.group = id;
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    label.title = name;
    const count = document.createElement('span');
    count.className = 'n';
    count.textContent = n;
    btn.append(UI.icon(iconName), label, count);
    btn.addEventListener('click', () => {
      activeGroupId = id;
      selected.clear();
      render();
    });
    li.append(btn);
    return li;
  };
  ul.append(item('', 'Tüm malzemeler', settings.library.length, 'layers'));
  const groups = MatStore.sortEntries(settings.groups.map((g) => ({ ...g, addedAt: g.createdAt })), { key: 'name', dir: 'asc' });
  if (groups.length) {
    const div = document.createElement('li');
    div.className = 'divider';
    ul.append(div);
  }
  groups.forEach((g) => ul.append(item(g.id, g.name, g.members.length, 'folder')));

  const g = activeGroup();
  $('group-head').hidden = !g;
  $('unassign-group').hidden = !g;
  if (g) {
    $('group-title').textContent = g.name;
    $('group-path').textContent = 'İndirilenler/' + MatStore.groupPath(settings, g);
    const meta = $('group-meta');
    meta.textContent = '';
    const chip = document.createElement('span');
    if (!g.lastWrittenAt) {
      chip.className = 'chip';
      chip.textContent = 'Henüz indirilmedi';
    } else if (MatStore.isGroupStale(g)) {
      chip.className = 'chip warn';
      chip.append(UI.icon('alert'), 'İndirilen dosya güncel değil');
      chip.title = 'Kategori son indirmeden sonra değişti. Güncel hâli için "Kategoriyi ANSYS kütüphanesi olarak indir"e basın.';
    } else {
      chip.className = 'chip ok';
      chip.append(UI.icon('check'), 'Güncel · ' + UI.formatDate(g.lastWrittenAt));
    }
    meta.append(chip);
    $('write-group').disabled = g.members.length === 0;
  }
}

// --- Liste ---
function visibleEntries() {
  const g = activeGroup();
  const members = g ? new Set(g.members) : null;
  const q = $('search').value.trim().toLocaleLowerCase('tr');
  const list = settings.library.filter((m) => {
    if (members && !members.has(m.uid)) return false;
    if (!q) return true;
    const text = [m.name, ...(m.data.categories || []), ...groupsOf(m.uid).map((x) => x.name)].join(' ');
    return text.toLocaleLowerCase('tr').includes(q);
  });
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
  renderGroups();

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
    const groups = groupsOf(m.uid);
    if (groups.length) {
      const chips = document.createElement('div');
      chips.className = 'group-chips';
      groups.forEach((g) => {
        const c = document.createElement('span');
        c.className = 'chip info';
        c.append(UI.icon('folder'), g.name);
        chips.append(c);
      });
      tdName.append(chips);
    }

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
      if (confirm(`"${m.name}" kütüphaneden (ve tüm kategorilerden) kaldırılsın mı?`)) return removeEntries([m.uid]);
    }));
    tdAct.append(del);

    tr.append(tdCheck, tdName, statusCell(m), tdDate, tdAct);
    tbody.append(tr);
  });

  const total = settings.library.length;
  const g = activeGroup();
  $('tab-count').textContent = total || '';
  $('table').hidden = total === 0 || entries.length === 0;
  $('toolbar').hidden = total === 0;
  $('empty').hidden = total > 0;
  $('no-match').hidden = !total || entries.length > 0;
  $('no-match').textContent = g && !g.members.length
    ? 'Bu kategori boş. "Tüm malzemeler"den malzeme seçip "Kategoriye ekle" ile ekleyin.'
    : 'Aramanızla eşleşen malzeme yok.';
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

// --- Diyaloglar ---
function openDialog(dialog, onConfirm) {
  return new Promise((resolve) => {
    const confirmBtn = dialog.querySelector('button[value="ok"]');
    const handler = (e) => {
      // Doğrulama başarısızsa diyalog açık kalır.
      const result = onConfirm();
      if (result === false) {
        e.preventDefault();
        return;
      }
      cleanup();
      dialog.close('ok');
      resolve(result);
    };
    const onClose = () => {
      cleanup();
      resolve(null);
    };
    function cleanup() {
      confirmBtn.removeEventListener('click', handler);
      dialog.removeEventListener('close', onClose);
    }
    confirmBtn.addEventListener('click', handler);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

function showError(id, text) {
  $(id).textContent = text;
  $(id).hidden = !text;
}

// Ad doğrulaması: boş olamaz, başka kategoriyle aynı olamaz.
function validateName(name, exceptId) {
  if (!name) return 'Bir ad yazın.';
  if (MatStore.findGroupByName(settings, name, exceptId)) return 'Bu adla bir kategori zaten var.';
  return '';
}

function askName(title, value, exceptId) {
  $('name-title').textContent = title;
  $('name-input').value = value || '';
  showError('name-error', '');
  const p = openDialog($('name-dialog'), () => {
    const name = MatStore.normalizeGroupName($('name-input').value);
    const err = validateName(name, exceptId);
    showError('name-error', err);
    return err ? false : name;
  });
  $('name-input').focus();
  $('name-input').select();
  return p;
}

function askAssign() {
  const box = $('assign-options');
  box.textContent = '';
  const groups = MatStore.sortEntries(settings.groups.map((g) => ({ ...g, addedAt: g.createdAt })), { key: 'name', dir: 'asc' });
  groups.forEach((g, i) => {
    const label = document.createElement('label');
    label.className = 'option';
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = 'assign-target';
    r.value = g.id;
    r.checked = g.id === activeGroupId || (!activeGroupId && i === 0);
    const name = document.createElement('span');
    name.textContent = g.name;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = g.members.length + ' malzeme';
    label.append(r, UI.icon('folder'), name, n);
    box.append(label);
  });
  $('assign-new-radio').checked = groups.length === 0;
  $('assign-new-name').value = '';
  $('assign-count').textContent = selected.size;
  showError('assign-error', '');
  const p = openDialog($('assign-dialog'), () => {
    const target = document.querySelector('input[name="assign-target"]:checked');
    if (!target) {
      showError('assign-error', 'Bir kategori seçin.');
      return false;
    }
    if (target.value !== '__new__') return { groupId: target.value };
    const name = MatStore.normalizeGroupName($('assign-new-name').value);
    const err = validateName(name);
    showError('assign-error', err);
    return err ? false : { newName: name };
  });
  if (!groups.length) $('assign-new-name').focus();
  return p;
}

// --- Kategori işlemleri ---
function createGroup(name, members) {
  const g = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), members: members || [], lastWrittenAt: '' };
  settings.groups.push(g);
  return g;
}

// Kategori dosyaları otomatik indirilmez; değişiklik yalnızca kaydedilir ve dosya "güncel değil" olarak işaretlenir.
async function saveGroupChange(g, message) {
  g.changedAt = new Date().toISOString();
  await MatStore.save({ groups: settings.groups });
  render();
  UI.toast(message);
}

async function assignSelected() {
  const answer = await askAssign();
  if (!answer) return;
  const g = answer.newName ? createGroup(answer.newName) : settings.groups.find((x) => x.id === answer.groupId);
  const before = g.members.length;
  g.members = [...new Set([...g.members, ...selected])];
  const added = g.members.length - before;
  selected.clear();
  await saveGroupChange(g, answer.newName
    ? `"${g.name}" kategorisi ${added} malzemeyle oluşturuldu.`
    : `${added} malzeme "${g.name}" kategorisine eklendi.`);
}

async function unassignSelected() {
  const g = activeGroup();
  if (!g) return;
  const n = selected.size;
  g.members = g.members.filter((u) => !selected.has(u));
  selected.clear();
  await saveGroupChange(g, `${n} malzeme "${g.name}" kategorisinden çıkarıldı (kütüphanede kalmaya devam eder).`);
}

async function newGroup() {
  const name = await askName('Yeni kategori');
  if (!name) return;
  const g = createGroup(name);
  activeGroupId = g.id;
  await MatStore.save({ groups: settings.groups });
  render();
  UI.toast(`"${name}" kategorisi oluşturuldu. "Tüm malzemeler"den malzeme seçip "Kategoriye ekle" ile doldurun.`);
}

async function renameGroup() {
  const g = activeGroup();
  const name = await askName('Kategoriyi yeniden adlandır', g.name, g.id);
  if (!name || name === g.name) return;
  const oldPath = MatStore.groupPath(settings, g);
  const wasDownloaded = !!g.lastWrittenAt;
  g.name = name;
  g.lastWrittenAt = '';
  await saveGroupChange(g, `Kategori "${name}" olarak adlandırıldı.` +
    (wasDownloaded ? ` Eski dosya (İndirilenler/${oldPath}) diskte kalır; yeni adla indirmek için "indir"e basın.` : ''));
}

async function deleteGroup() {
  const g = activeGroup();
  if (!confirm(`"${g.name}" kategorisi silinsin mi?\n\nMalzemeler kütüphanede kalır. Daha önce indirilmiş dosyası (İndirilenler/${MatStore.groupPath(settings, g)}) diskte kalır.`)) return;
  settings.groups = settings.groups.filter((x) => x.id !== g.id);
  activeGroupId = '';
  await MatStore.save({ groups: settings.groups });
  render();
  UI.toast(`"${g.name}" kategorisi silindi.`);
}

async function writeActiveGroup() {
  const g = activeGroup();
  const path = await MatStore.writeGroup(settings, g);
  render();
  UI.toast(`"${g.name}" ANSYS kütüphanesi olarak indirildi: İndirilenler/${path}`);
}

// --- Diğer işlemler ---
async function setSort(key, dir) {
  settings.sort = { key, dir };
  await MatStore.save({ sort: settings.sort });
  render();
}

async function removeEntries(uids) {
  const drop = new Set(uids);
  MatStore.markGroupsChanged(settings, uids);
  settings.library = settings.library.filter((m) => !drop.has(m.uid));
  settings.groups.forEach((g) => { g.members = g.members.filter((u) => !drop.has(u)); });
  uids.forEach((u) => selected.delete(u));
  await MatStore.save({ library: settings.library, groups: settings.groups });
  const writeMain = settings.autoUpdate && (settings.library.length || settings.lastWrittenAt);
  if (writeMain) await MatStore.writeLibrary(settings);
  render();
  UI.toast(`${uids.length} malzeme kütüphaneden kaldırıldı.` + (writeMain ? ' Ana ANSYS dosyası güncellendi.' : ''));
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
  render();
  UI.toast('Ayarlar kaydedildi. Dosyaları oluşturmak için Malzemeler sekmesinde “Şimdi güncelle”ye basın.');
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
$('assign-group').addEventListener('click', guard(assignSelected));
$('unassign-group').addEventListener('click', guard(unassignSelected));
$('new-group').addEventListener('click', guard(newGroup));
$('rename-group').addEventListener('click', guard(renameGroup));
$('delete-group').addEventListener('click', guard(deleteGroup));
$('write-group').addEventListener('click', guard(writeActiveGroup));
$('assign-new-name').addEventListener('input', () => { $('assign-new-radio').checked = true; });
// "Vazgeç" gönderme düğmesi değildir; böylece Enter her zaman onay düğmesini çalıştırır.
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$('download-selected').addEventListener('click', guard(downloadSelected));
$('remove-selected').addEventListener('click', guard(() => {
  if (confirm(`${selected.size} malzeme kütüphaneden (ve tüm kategorilerden) kaldırılsın mı?`)) return removeEntries([...selected]);
}));
$('write-library').addEventListener('click', guard(async () => {
  const path = await MatStore.writeLibrary(settings);
  render();
  UI.toast(`ANSYS kütüphane dosyası güncellendi: İndirilenler/${path}`);
}));
$('folder').addEventListener('input', updatePathPreview);
$('file-name').addEventListener('input', updatePathPreview);
$('save-settings').addEventListener('click', guard(saveSettings));

// Panelden malzeme eklenince liste kendiliğinden yenilenir (kaydedilmemiş form alanlarına dokunulmaz).
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !settings) return;
  ['library', 'sort', 'lastWrittenAt', 'groups'].forEach((k) => {
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
