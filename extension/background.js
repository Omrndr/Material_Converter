// Araç çubuğu düğmesine basılınca etkin MatWeb sekmesindeki veri sayfasını XML olarak indirir.
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

const MATWEB_HOST = /(^|\.)matweb\.com$/i;

const MSG = {
  notMatweb: 'Bu düğme yalnızca MatWeb malzeme veri sayfalarında çalışır.',
  noData: 'Bu sayfada MatWeb özellik tablosu bulunamadı. Bir malzemenin veri sayfasını (DataSheet) açtığınızdan emin olun.',
  failed: 'XML oluşturulamadı: '
};

async function flashBadge(tabId, text, color) {
  await api.action.setBadgeBackgroundColor({ tabId, color });
  await api.action.setBadgeText({ tabId, text });
  setTimeout(() => api.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2500);
}

async function showAlert(tabId, message) {
  try {
    await api.scripting.executeScript({ target: { tabId }, func: (m) => alert(m), args: [message] });
  } catch {
    // about:, eklenti mağazası gibi betik eklenemeyen sayfalar: yalnızca rozet gösterilir.
  }
}

function isMatweb(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && MATWEB_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

// Sayfa içinde (içerik betiği bağlamında) çalışır.
function extractInPage() {
  const data = globalThis.MatwebParser.parseDatasheet(document);
  if (!data.groups.length) return { error: 'noData' };
  return {
    fileName: globalThis.MatwebXml.fileNameFor(data.name),
    xml: globalThis.MatwebXml.toXml(data, {
      sourceUrl: location.href,
      exportedAt: new Date().toISOString()
    })
  };
}

async function download(xml, fileName) {
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  try {
    await api.downloads.download({ url, filename: fileName, saveAs: false, conflictAction: 'uniquify' });
  } finally {
    // İndirme başladıktan sonra blob adresi serbest bırakılabilir.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

api.action.onClicked.addListener(async (tab) => {
  if (!isMatweb(tab.url)) {
    await flashBadge(tab.id, '!', '#b00020');
    await showAlert(tab.id, MSG.notMatweb);
    return;
  }
  try {
    await api.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/matweb-parser.js', 'lib/xml-writer.js']
    });
    const [{ result }] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: extractInPage });
    if (result.error) {
      await flashBadge(tab.id, '!', '#b00020');
      await showAlert(tab.id, MSG[result.error]);
      return;
    }
    await download(result.xml, result.fileName);
    await flashBadge(tab.id, '✓', '#1b7f3b');
  } catch (e) {
    console.error(e);
    await flashBadge(tab.id, '!', '#b00020');
    await showAlert(tab.id, MSG.failed + (e && e.message ? e.message : e));
  }
});
