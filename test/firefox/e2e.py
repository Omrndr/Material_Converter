"""Eklentinin gerçek Firefox'ta uçtan uca testi.

Araç çubuğu düğmesine gerçek fare tıklaması yapılır (activeTab izni böyle verilir), açılan panelde
"Kütüphaneye ekle" vb. düğmelere basılır, indirilen dosyalar kontrol edilir. www.matweb.com istekleri
yerel sahte sunucuya (fake_matweb.py) yönlendirilir; internet erişimi gerekmez.

Gereksinimler: Firefox (>=140), geckodriver, Xvfb (ekransız ortamda), `pip install selenium`.
    FIREFOX_BIN=/yol/firefox GECKODRIVER=/yol/geckodriver xvfb-run -a python test/firefox/e2e.py
"""
import os
import shutil
import sys
import tempfile
import threading
import time
import http.server
import xml.etree.ElementTree as ET

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

import fake_matweb

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.normpath(os.path.join(HERE, '..', '..', 'extension'))
ADDON_ID = 'matweb-xml@material-converter'
WIDGET = 'matweb-xml_material-converter-browser-action'
PORT = 8765
PAC = ('data:text/plain,function FindProxyForURL(u,h){return h.indexOf("matweb.com")>=0?'
       '"PROXY 127.0.0.1:%d":"DIRECT";}' % PORT)
LIBRARY = 'MatWeb_ANSYS_Kutuphanesi.xml'

failures = []


def check(cond, label):
    print(('TAMAM ' if cond else 'HATA  ') + label)
    if not cond:
        failures.append(label)


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), fake_matweb.H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    downloads = tempfile.mkdtemp(prefix='matweb-dl-')

    o = Options()
    if os.environ.get('FIREFOX_BIN'):
        o.binary_location = os.environ['FIREFOX_BIN']
    o.page_load_strategy = 'eager'
    for k, v in {
        'network.proxy.type': 2,
        'network.proxy.autoconfig_url': PAC,
        'browser.download.dir': downloads,
        'browser.download.folderList': 2,
        'browser.download.useDownloadDir': True,
        # Panel DOM'unu test tarafından okuyabilmek için eklentiyi ana süreçte çalıştır.
        'extensions.webextensions.remote': False,
    }.items():
        o.set_preference(k, v)
    service = Service(os.environ.get('GECKODRIVER', 'geckodriver'), service_args=['--allow-system-access'])
    d = webdriver.Firefox(options=o, service=service)

    def chrome(js, *args):
        with d.context(d.CONTEXT_CHROME):
            return d.execute_script(js, *args)

    def popup_state():
        return chrome('''
          const b = document.querySelector('browser[webextension-view-type="popup"]');
          const doc = b && b.contentDocument;
          if (!doc || !doc.getElementById('page-name')) return null;
          const page = doc.getElementById('page-name').textContent;
          if (page.includes('kontrol ediliyor')) return null;
          const btn = document.getElementById(arguments[0]);
          return {
            page, addDisabled: doc.getElementById('add').disabled, add: doc.getElementById('add').textContent,
            items: [...doc.querySelectorAll('#list li a')].map(a => a.textContent),
            warnings: [...doc.querySelectorAll('#page-warnings li')].map(li => li.textContent),
            status: doc.getElementById('status').textContent,
            badge: (btn.querySelector('.toolbarbutton-badge') || {}).textContent || ''
          };''', WIDGET)

    def open_popup():
        with d.context(d.CONTEXT_CHROME):
            ActionChains(d).move_to_element(d.find_element(By.ID, WIDGET)).click().perform()
        for _ in range(50):
            st = popup_state()
            if st:
                return st
            time.sleep(0.2)
        raise RuntimeError('Eklenti paneli açılmadı')

    def click(element_id):
        chrome('''document.querySelector('browser[webextension-view-type="popup"]')
                    .contentDocument.getElementById(arguments[0]).click();''', element_id)
        time.sleep(1.5)
        return popup_state()

    def close_popup():
        chrome('''const b = document.querySelector('browser[webextension-view-type="popup"]');
                  if (b) b.closest('panel').hidePopup();''')
        time.sleep(0.5)

    def visit(guid):
        d.get('http://www.matweb.com/search/DataSheet.aspx?MatGUID=' + guid)
        time.sleep(0.5)

    try:
        d.install_addon(EXT, temporary=True)
        print('Firefox', d.capabilities['browserVersion'])
        time.sleep(1)
        # Kullanıcının "Araç çubuğuna sabitle" demesine karşılık gelir.
        chrome('CustomizableUI.addWidgetToArea(arguments[0], CustomizableUI.AREA_NAVBAR);', WIDGET)

        d.get('about:blank')
        st = open_popup()
        check(st['addDisabled'] and 'MatWeb sayfası değil' in st['page'], 'MatWeb dışı sayfada ekleme kapalı')
        close_popup()

        visit('a' * 32)
        st = open_popup()
        check(st['page'] == 'Test Alloy T6; T651' and not st['addDisabled'], 'koşullu sayfa okundu')
        st = click('add')
        check(st['items'] == ['Test Alloy T6; T651'] and st['badge'] == '1', 'ilk malzeme eklendi, rozet 1')
        close_popup()

        visit('b' * 32)
        st = open_popup()
        check(st['page'] == 'Test Steel', '"Overview" sayfa adı sadeleştirildi')
        check(len(st['warnings']) == 1 and 'Overview' in st['warnings'][0], 'Overview sayfası için uyarı gösterildi')
        st = click('add')
        check(st['items'] == ['Test Steel', 'Test Alloy T6; T651'] and st['badge'] == '2', 'ikinci malzeme eklendi (en yeni üstte), rozet 2')
        st = click('export-one')
        check('Genel XML' in st['status'], 'genel XML indirildi')
        close_popup()

        st = open_popup()
        check(st['add'] == 'Kütüphanede güncelle', 'kütüphanedeki malzeme tanındı')
        st = click('add')
        check(len(st['items']) == 2 and 'güncellendi' in st['status'], 'tekrar eklemede kopya oluşmadı')
        close_popup()

        time.sleep(2)
        files = sorted(os.listdir(downloads))
        print('İndirilenler:', files)
        check(files == [LIBRARY, 'Test_Steel.xml'], 'kütüphane tek dosya olarak üzerine yazıldı')
        root = ET.parse(os.path.join(downloads, LIBRARY)).getroot()
        names = [n.text for n in root.iterfind('./Materials/MatML_Doc/Material/BulkDetails/Name')]
        check(root.tag == 'EngineeringData' and names == ['Test Alloy T6; T651', 'Test Steel'],
              'ANSYS kütüphanesinde iki malzeme var')

        # --- Paneldeki malzeme adı bağlantısı yeni sekmede MatWeb sayfasını açar
        handles = set(d.window_handles)
        open_popup()
        chrome('''document.querySelector('browser[webextension-view-type="popup"]')
                    .contentDocument.querySelector('#list li a').click();''')
        time.sleep(1.5)
        new = set(d.window_handles) - handles
        check(len(new) == 1, 'paneldeki bağlantı yeni sekme açtı')
        if new:
            d.switch_to.window(new.pop())
            check(d.current_url == 'http://www.matweb.com/search/DataSheet.aspx?MatGUID=' + 'b' * 32,
                  'bağlantı temizlenmiş MatWeb adresine gidiyor: ' + d.current_url)

        # --- Kütüphane sayfası (ayrı sekme)
        lib_url = chrome('return WebExtensionPolicy.getByID(arguments[0]).getURL("library.html")', ADDON_ID)
        d.get(lib_url)
        time.sleep(1)

        def rows():
            return d.execute_script('''return [...document.querySelectorAll('#rows tr')].map(tr => ({
                name: tr.children[1].textContent, href: tr.querySelector('a').getAttribute('href'),
                warn: tr.children[4].textContent }))''')

        def js(code, *args):
            r = d.execute_script(code, *args)
            time.sleep(1.2)
            return r

        r = rows()
        check([x['name'] for x in r] == ['Test Steel', 'Test Alloy T6; T651'], 'kütüphane sayfası: varsayılan sıra en yeni üstte')
        check('Overview' in r[0]['warn'] and r[1]['warn'] == '', 'kütüphane sayfası: uyarı sütunu')
        js("const s = document.getElementById('sort'); s.value = 'name:asc'; s.dispatchEvent(new Event('change'));")
        check([x['name'] for x in rows()] == ['Test Alloy T6; T651', 'Test Steel'], 'ada göre sıralama (A → Z)')
        js("document.querySelector('th[data-sort=name]').click();")
        check([x['name'] for x in rows()] == ['Test Steel', 'Test Alloy T6; T651'], 'başlığa tıklayınca sıra tersine döndü')
        js("const q = document.getElementById('search'); q.value = 'alloy'; q.dispatchEvent(new Event('input'));")
        check([x['name'] for x in rows()] == ['Test Alloy T6; T651'], 'arama süzüyor')
        js("const q = document.getElementById('search'); q.value = ''; q.dispatchEvent(new Event('input'));")

        # Yalnızca seçilen malzemeyi içeren XML
        js("document.querySelectorAll('#rows tr')[1].querySelector('input[type=checkbox]').click();")
        js("document.getElementById('download-selected').click();")
        sel = [f for f in os.listdir(downloads) if f.startswith('MatWeb_Secim_')]
        check(len(sel) == 1, 'seçili malzemeler ayrı dosyaya indirildi: ' + ', '.join(sel))
        if sel:
            names = [n.text for n in ET.parse(os.path.join(downloads, sel[0])).getroot()
                     .iterfind('./Materials/MatML_Doc/Material/BulkDetails/Name')]
            check(names == ['Test Alloy T6; T651'], 'seçim dosyasında yalnızca seçilen malzeme var')

        # İndirme konumu ayarı: İndirilenler/ANSYS/Kutuphane altında sabit dosya
        js('''document.getElementById('folder').value = '../ANSYS/Kutuphane';
              document.getElementById('save-settings').click();''')
        check(d.find_element(By.ID, 'path-preview').text == 'İndirilenler/ANSYS/Kutuphane/' + LIBRARY,
              'konum ayarı kaydedildi ve güvenli hâle getirildi')
        js("document.getElementById('write-library').click();")
        target = os.path.join(downloads, 'ANSYS', 'Kutuphane', LIBRARY)
        check(os.path.exists(target), 'kütüphane ayarlanan alt klasöre yazıldı')

        # Seçilileri sil (iki tıklamalı onay) -> otomatik güncelleme yeni konuma yazar
        js("document.getElementById('remove-selected').click();")
        js("document.getElementById('remove-selected').click();")
        check([x['name'] for x in rows()] == ['Test Steel'], 'seçili malzeme silindi')
        names = [n.text for n in ET.parse(target).getroot().iterfind('./Materials/MatML_Doc/Material/BulkDetails/Name')]
        check(names == ['Test Steel'], 'silme sonrası kütüphane dosyası güncellendi')
    finally:
        d.quit()
        server.shutdown()
        shutil.rmtree(downloads, ignore_errors=True)

    print('\n%d hata' % len(failures) if failures else '\nTüm Firefox testleri geçti.')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
