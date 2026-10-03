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
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

import fake_matweb

HERE = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.normpath(os.path.join(HERE, '..', '..', 'extension'))
ADDON_ID = 'material-converter@omrndr'
WIDGET = 'material-converter_omrndr-browser-action'
PORT = 8765
PAC = ('data:text/plain,function FindProxyForURL(u,h){return h.indexOf("matweb.com")>=0?'
       '"PROXY 127.0.0.1:%d":"DIRECT";}' % PORT)
LIBRARY = 'MatWeb_ANSYS_Library.xml'  # Firefox İngilizce arayüzle çalışır

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
          if (!doc || !doc.getElementById('state-loading') || !doc.getElementById('state-loading').hidden) return null;
          const vis = (id) => !doc.getElementById(id).hidden;
          const btn = document.getElementById(arguments[0]);
          const toast = doc.getElementById('toast');
          return {
            state: ['empty', 'nodata', 'material'].find((s) => vis('state-' + s)),
            name: doc.getElementById('mat-name').textContent,
            inLibrary: doc.getElementById('mat-status').classList.contains('ok'),
            props: doc.getElementById('mat-props').textContent,
            add: doc.getElementById('add').textContent.trim(),
            warnings: [...doc.querySelectorAll('#page-warnings .notice')].map((n) => n.textContent),
            count: doc.getElementById('count').textContent,
            toast: toast.hidden ? '' : toast.textContent,
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
        handles_before = set(d.window_handles)
        d.install_addon(EXT, temporary=True)
        print('Firefox', d.capabilities['browserVersion'])
        time.sleep(2)
        opened = [h for h in d.window_handles if h not in handles_before]
        setup_ok = False
        for h in opened:
            d.switch_to.window(h)
            setup_ok = setup_ok or d.current_url.endswith('library.html#setup')
            d.close()
        d.switch_to.window(sorted(handles_before)[0])
        check(setup_ok, 'ilk kurulumda "Kurulum ve ayarlar" sayfası açıldı')
        # Kullanıcının "Araç çubuğuna sabitle" demesine karşılık gelir.
        chrome('CustomizableUI.addWidgetToArea(arguments[0], CustomizableUI.AREA_NAVBAR);', WIDGET)

        d.get('about:blank')
        st = open_popup()
        check(st['state'] == 'empty', 'MatWeb dışı sayfada kullanım adımları gösteriliyor')
        close_popup()

        visit('a' * 32)
        st = open_popup()
        check(st['state'] == 'material' and st['name'] == 'Test Alloy T6; T651' and not st['inLibrary'],
              'malzeme okundu, "Kütüphanede değil" gösteriliyor')
        check(st['props'] == "7 properties go to ANSYS" and not st['warnings'], 'aktarılacak özellik sayısı: ' + st['props'])
        st = click('add')
        check(st['inLibrary'] and st['add'] == 'Update in library' and st['count'] == '1' and st['badge'] == '1',
              'ilk malzeme eklendi; durum, sayaç ve rozet güncellendi')
        check('was added' in st['toast'], 'bildirim gösterildi: ' + st['toast'])
        close_popup()

        visit('b' * 32)
        st = open_popup()
        check(st['name'] == 'Test Steel', '"Overview" sayfa adı sadeleştirildi')
        check(len(st['warnings']) == 1 and 'overview' in st['warnings'][0], 'Overview sayfası için uyarı gösterildi')
        st = click('add')
        check(st['count'] == '2' and st['badge'] == '2', 'ikinci malzeme eklendi, rozet 2')
        st = click('export-one')
        check('Test_Steel.xml' in st['toast'], 'tüm veri ayrı XML olarak indirildi')
        close_popup()

        st = open_popup()
        check(st['add'] == 'Update in library', 'kütüphanedeki malzeme tanındı')
        st = click('add')
        check(st['count'] == '2' and 'was updated' in st['toast'], 'tekrar eklemede kopya oluşmadı')
        close_popup()

        time.sleep(2)
        files = sorted(os.listdir(downloads))
        print('İndirilenler:', files)
        check(files == [LIBRARY, 'Test_Steel.xml'], 'kütüphane tek dosya olarak üzerine yazıldı')
        root = ET.parse(os.path.join(downloads, LIBRARY)).getroot()
        names = [n.text for n in root.iterfind('./Materials/MatML_Doc/Material/BulkDetails/Name')]
        check(root.tag == 'EngineeringData' and names == ['Test Alloy T6; T651', 'Test Steel'],
              'ANSYS kütüphanesinde iki malzeme var')

        # --- "Kütüphaneyi yönet" kütüphane sayfasını yeni sekmede açar
        handles = set(d.window_handles)
        open_popup()
        chrome('''document.querySelector('browser[webextension-view-type="popup"]')
                    .contentDocument.getElementById('open-library').click();''')
        time.sleep(1.5)
        new = set(d.window_handles) - handles
        check(len(new) == 1, '"Kütüphaneyi yönet" yeni sekme açtı')
        d.switch_to.window(new.pop())
        check(d.current_url.endswith('/library.html'), 'kütüphane sayfası açıldı')
        time.sleep(1)

        def rows():
            return d.execute_script('''return [...document.querySelectorAll('#rows tr')].map(tr => ({
                name: tr.querySelector('a.mat-name').textContent, href: tr.querySelector('a.mat-name').getAttribute('href'),
                status: tr.querySelector('.status').textContent }))''')

        def js(code, *args):
            r = d.execute_script(code, *args)
            time.sleep(1.2)
            return r

        r = rows()
        check([x['name'] for x in r] == ['Test Steel', 'Test Alloy T6; T651'], 'kütüphane: varsayılan sıra en yeni üstte')
        check('attention' in r[0]['status'] and 'overview' in r[0]['status'] and 'Ready' in r[1]['status'],
              'kütüphane: ANSYS durum sütunu')
        check(r[0]['href'] == 'http://www.matweb.com/search/DataSheet.aspx?MatGUID=' + 'b' * 32, 'malzeme bağlantısı MatWeb sayfasına gidiyor')
        check(d.find_element(By.ID, 'selection-bar').is_displayed() is False, 'seçim yokken toplu işlem çubuğu gizli')

        # Bağlantı yeni sekmede açılır
        handles = set(d.window_handles)
        js("document.querySelector('#rows a.mat-name').click();")
        new = set(d.window_handles) - handles
        check(len(new) == 1, 'malzeme adına tıklayınca MatWeb sayfası yeni sekmede açıldı')
        lib_handle = d.current_window_handle
        for h in new:
            d.switch_to.window(h)
            d.close()
        d.switch_to.window(lib_handle)

        js("const s = document.getElementById('sort'); s.value = 'name:asc'; s.dispatchEvent(new Event('change'));")
        check([x['name'] for x in rows()] == ['Test Alloy T6; T651', 'Test Steel'], 'ada göre sıralama (A → Z)')
        js("document.querySelector('th[data-sort=name]').click();")
        check([x['name'] for x in rows()] == ['Test Steel', 'Test Alloy T6; T651'], 'başlığa tıklayınca sıra tersine döndü')
        js("const q = document.getElementById('search'); q.value = 'alloy'; q.dispatchEvent(new Event('input'));")
        check([x['name'] for x in rows()] == ['Test Alloy T6; T651'], 'arama süzüyor')
        js("const q = document.getElementById('search'); q.value = ''; q.dispatchEvent(new Event('input'));")

        # Yalnızca seçilen malzemeyi içeren XML
        js("document.querySelectorAll('#rows tr')[1].querySelector('input[type=checkbox]').click();")
        check(d.find_element(By.ID, 'selection-bar').is_displayed() and d.find_element(By.ID, 'selection-count').text == '1',
              'seçince "1 malzeme seçildi" çubuğu göründü')
        js("document.getElementById('download-selected').click();")
        sel = [f for f in os.listdir(downloads) if f.startswith('MatWeb_Selection_')]
        check(len(sel) == 1, 'seçilen malzemeler ayrı dosyaya indirildi: ' + ', '.join(sel))
        if sel:
            names = [n.text for n in ET.parse(os.path.join(downloads, sel[0])).getroot()
                     .iterfind('./Materials/MatML_Doc/Material/BulkDetails/Name')]
            check(names == ['Test Alloy T6; T651'], 'seçim dosyasında yalnızca seçilen malzeme var')

        # Kurulum ve ayarlar sekmesi: konum
        js("location.hash = '#setup';")
        check(d.find_element(By.ID, 'view-setup').is_displayed() and not d.find_element(By.ID, 'view-materials').is_displayed(),
              '"Kurulum ve ayarlar" sekmesine geçildi')
        js('''document.getElementById('folder').value = '../ANSYS/Kutuphane';
              document.getElementById('folder').dispatchEvent(new Event('input'));
              document.getElementById('save-settings').click();''')
        check(d.find_element(By.ID, 'path-preview').text == 'Downloads/ANSYS/Kutuphane/' + LIBRARY,
              'konum ayarı kaydedildi ve güvenli hâle getirildi')
        check(d.find_element(By.ID, 'setup-path').text == 'Downloads/ANSYS/Kutuphane/' + LIBRARY, 'ANSYS adımlarında yeni yol gösteriliyor')
        js("location.hash = '#materials';")
        js("document.getElementById('write-library').click();")
        target = os.path.join(downloads, 'ANSYS', 'Kutuphane', LIBRARY)
        check(os.path.exists(target), 'kütüphane ayarlanan alt klasöre yazıldı')
        check('Last update' in d.find_element(By.ID, 'file-meta').text, 'son güncelleme zamanı gösteriliyor')

        # Seçilenleri kaldır (onay penceresi) -> otomatik güncelleme yeni konuma yazar
        d.execute_script("setTimeout(() => document.getElementById('remove-selected').click(), 0);")
        time.sleep(0.5)
        d.switch_to.alert.accept()
        time.sleep(1.5)
        check([x['name'] for x in rows()] == ['Test Steel'], 'seçilen malzeme onaydan sonra kaldırıldı')
        names = [n.text for n in ET.parse(target).getroot().iterfind('./Materials/MatML_Doc/Material/BulkDetails/Name')]
        check(names == ['Test Steel'], 'kaldırma sonrası kütüphane dosyası güncellendi')

        # --- Kategoriler: seç -> "Kategoriye ekle" -> yeni ad -> kendi adını taşıyan dosya
        def lib_names(path):
            root = ET.parse(path).getroot()
            return [n.text for n in root.iterfind('./Materials/MatML_Doc/Material/BulkDetails/Name')], root.findtext('Notes')

        def groups():
            return d.execute_script('''return [...document.querySelectorAll('.group-item')].map(b =>
                [b.querySelector('.name').textContent, b.querySelector('.n').textContent, b.classList.contains('active')])''')

        def type_enter(element_id, text):
            # Gerçek klavye girişi: metni yaz ve Enter'a bas.
            el = d.find_element(By.ID, element_id)
            el.clear()
            el.send_keys(text + Keys.ENTER)
            time.sleep(1.2)

        def dialog_open(element_id):
            return d.execute_script("return document.getElementById(arguments[0]).open", element_id)

        kdir = os.path.join(downloads, 'ANSYS', 'Kutuphane')
        js("document.getElementById('select-all').click();")
        js("document.getElementById('assign-group').click();")
        check(dialog_open('assign-dialog'), '"Kategoriye ekle" penceresi açıldı')
        type_enter('assign-new-name', 'Test grubu')
        check(not dialog_open('assign-dialog'), 'Enter tuşu kategoriyi oluşturdu ve pencereyi kapattı')
        check(['Test grubu', '1', False] in groups(), 'yeni kategori yan panelde: ' + str(groups()))
        gfile = os.path.join(kdir, 'Test grubu.xml')
        check(not os.path.exists(gfile), 'kategori dosyası otomatik indirilmedi')
        check(d.execute_script("return document.querySelector('.group-chips').textContent").strip() == 'Test grubu',
              'malzeme satırında kategori etiketi görünüyor')

        # Aynı adla ikinci kategori engellenir (Enter ile)
        js("document.getElementById('new-group').click();")
        type_enter('name-input', 'test GRUBU')
        check(dialog_open('name-dialog') and 'already exists' in d.find_element(By.ID, 'name-error').text, 'aynı adlı kategori engellendi')
        d.find_element(By.ID, 'name-input').send_keys(Keys.ESCAPE)
        time.sleep(0.5)
        check(not dialog_open('name-dialog'), 'Esc ile pencere kapandı')

        # Kategoriyi aç: dosya ancak "indir" düğmesiyle oluşur
        js("[...document.querySelectorAll('.group-item')].find(b => b.textContent.includes('Test grubu')).click();")
        check(d.find_element(By.ID, 'group-head').is_displayed() and d.find_element(By.ID, 'group-title').text == 'Test grubu',
              'kategori seçilince başlığı görünüyor')
        check('Not downloaded yet' in d.find_element(By.ID, 'group-meta').text, 'başlıkta "Henüz indirilmedi" yazıyor')
        js("document.getElementById('write-group').click();")
        check(os.path.exists(gfile) and lib_names(gfile) == (['Test Steel'], 'Category: Test grubu'),
              '"indir" düğmesiyle kategori kendi adını taşıyan ANSYS dosyasına yazıldı')
        check('Up to date' in d.find_element(By.ID, 'group-meta').text, 'başlıkta "Güncel" yazıyor')

        # Yeniden adlandır (Enter ile): yeni adla dosya otomatik oluşmaz
        js("document.getElementById('rename-group').click();")
        type_enter('name-input', 'Seçilmiş çelikler')
        rfile = os.path.join(kdir, 'Seçilmiş çelikler.xml')
        check(d.find_element(By.ID, 'group-title').text == 'Seçilmiş çelikler' and not os.path.exists(rfile),
              'kategori yeniden adlandırıldı, dosya otomatik indirilmedi')
        js("document.getElementById('write-group').click();")
        check(os.path.exists(rfile), 'yeni adla elle indirildi')

        # Kategoriden çıkar: dosya otomatik değişmez, "güncel değil" uyarısı çıkar
        js("document.getElementById('select-all').click();")
        js("document.getElementById('unassign-group').click();")
        check(rows() == [] and lib_names(rfile)[0] == ['Test Steel'], 'kategoriden çıkarıldı; dosya otomatik değişmedi')
        check('out of date' in d.find_element(By.ID, 'group-meta').text, 'başlıkta "İndirilen dosya güncel değil" uyarısı var')
        js("document.querySelectorAll('.group-item')[0].click();")
        check([x['name'] for x in rows()] == ['Test Steel'], 'malzeme kütüphanede kalmaya devam ediyor')

        # Kategoriyi sil (onay penceresi)
        js("[...document.querySelectorAll('.group-item')].find(b => b.textContent.includes('Seçilmiş')).click();")
        d.execute_script("setTimeout(() => document.getElementById('delete-group').click(), 0);")
        time.sleep(0.5)
        d.switch_to.alert.accept()
        time.sleep(1)
        check([g[0] for g in groups()] == ['All materials'], 'kategori silindi')
    finally:
        d.quit()
        server.shutdown()
        shutil.rmtree(downloads, ignore_errors=True)

    print('\n%d hata' % len(failures) if failures else '\nTüm Firefox testleri geçti.')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
