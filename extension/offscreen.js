// Yalnızca Chrome/Edge: arka plandaki service worker için XML'den blob adresi üretir ve sonra serbest bırakır.
'use strict';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;
  if (msg.type === 'create-blob-url') {
    sendResponse({ url: URL.createObjectURL(new Blob([msg.xml], { type: 'application/xml' })) });
  } else if (msg.type === 'revoke-blob-url') {
    URL.revokeObjectURL(msg.url);
    sendResponse({ ok: true });
  }
  return false;
});
