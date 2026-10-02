// Arka plan: paneldeki indirme isteklerini yürütür ve düğme rozetinde kütüphanedeki malzeme sayısını gösterir.
// İndirme burada yapılır çünkü panel kapanınca panelde oluşturulan blob adresi geçersiz olur.
// Firefox'ta bu betik DOM'u olan bir arka plan sayfasında, Chrome/Edge'de ise DOM'suz bir service worker'da çalışır.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const OFFSCREEN_URL = 'offscreen.html';

// Service worker'da URL.createObjectURL yoktur; blob adresi offscreen belgede oluşturulur (Chrome/Edge).
const canMakeBlobUrl = typeof URL.createObjectURL === 'function' && typeof document !== 'undefined';

let offscreenReady = null;
function ensureOffscreen() {
  if (!offscreenReady) {
    offscreenReady = api.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Kütüphane XML dosyasını indirmek için blob adresi oluşturma'
    }).catch((e) => {
      // Belge zaten açıksa sorun yok.
      if (!/single offscreen|already/i.test(String(e && e.message))) {
        offscreenReady = null;
        throw e;
      }
    });
  }
  return offscreenReady;
}

async function makeBlobUrl(xml) {
  if (canMakeBlobUrl) {
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  await ensureOffscreen();
  const res = await api.runtime.sendMessage({ target: 'offscreen', type: 'create-blob-url', xml });
  if (!res || !res.url) throw new Error('Dosya hazırlanamadı');
  return {
    url: res.url,
    revoke: () => api.runtime.sendMessage({ target: 'offscreen', type: 'revoke-blob-url', url: res.url }).catch(() => {})
  };
}

async function download({ xml, filename, overwrite }) {
  const blob = await makeBlobUrl(xml);
  try {
    await api.downloads.download({
      url: blob.url,
      filename,
      saveAs: false,
      // Kütüphane dosyası her seferinde aynı adla üzerine yazılır; ANSYS hep aynı dosyayı okur.
      conflictAction: overwrite ? 'overwrite' : 'uniquify'
    });
  } finally {
    setTimeout(blob.revoke, 60000);
  }
}

// Yanıt sendResponse ile verilir: Chrome, dinleyiciden dönen Promise'i yanıt olarak kabul etmez.
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'download') return false;
  download(msg).then(
    () => sendResponse({ ok: true }),
    (e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) })
  );
  return true;
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
api.runtime.onInstalled.addListener((details) => {
  updateBadge();
  // İlk kurulumda kullanıcıyı kurulum rehberine götür.
  if (details && details.reason === 'install') {
    api.tabs.create({ url: api.runtime.getURL('library.html#kurulum') });
  }
});
