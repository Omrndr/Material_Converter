// Arka plan: paneldeki indirme isteklerini yürütür ve düğme rozetinde kütüphanedeki malzeme sayısını gösterir.
// İndirme burada yapılır çünkü panel kapanınca panelde oluşturulan blob adresi geçersiz olur.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

async function download({ xml, filename, overwrite }) {
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  try {
    await api.downloads.download({
      url,
      filename,
      saveAs: false,
      // Kütüphane dosyası her seferinde aynı adla üzerine yazılır; ANSYS hep aynı dosyayı okur.
      conflictAction: overwrite ? 'overwrite' : 'uniquify'
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

api.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'download') return undefined;
  return download(msg).then(
    () => ({ ok: true }),
    (e) => ({ ok: false, error: e && e.message ? e.message : String(e) })
  );
});

async function updateBadge() {
  const { library = [] } = await api.storage.local.get('library');
  await api.action.setBadgeBackgroundColor({ color: '#1f5fa8' });
  await api.action.setBadgeText({ text: library.length ? String(library.length) : '' });
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.library) updateBadge();
});
api.runtime.onStartup.addListener(updateBadge);
api.runtime.onInstalled.addListener(updateBadge);
