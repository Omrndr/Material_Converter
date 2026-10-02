<p align="center"><img src="extension/icons/icon-128.png" width="96" alt="Material Converter logosu"></p>

# Material_Converter

MatWeb malzeme veri sayfalarını tek tıkla **ANSYS Workbench Engineering Data** kütüphanesine (XML) ekleyen
tarayıcı eklentisi.

- Tamamen yerel çalışır: sunucu, Python kurulumu, OCR veya yapay zekâ modeli yoktur.
- Ayrıştırma doğrudan sayfanın HTML tablosundan yapıldığı için değerler birebir aktarılır.
- Eklenen malzemeler eklentinin hafızasında tutulur; hepsi **tek bir kütüphane dosyasına** yazılır.

Firefox, Google Chrome ve Microsoft Edge'de çalışır.

## Kullanım

Eklenti iki ekrandan oluşur:

**1. Araç çubuğu paneli: malzeme eklemek için.** MatWeb'de bir malzemenin veri sayfası açıkken araç çubuğundaki
**Material Converter** düğmesine tıklayın. Panel malzemenin adını, kütüphanede olup olmadığını, ANSYS'e kaç özellik
aktarılacağını ve varsa uyarıları gösterir. **Kütüphaneye ekle** ile malzeme eklenir ve ANSYS dosyası güncellenir.
**Tüm veriyi ayrı XML olarak indir**, sayfadaki her şeyi (sertlik, kompozisyon, koşullu değerler) ayrı bir dosyaya yazar.

**2. Kütüphane sayfası: kütüphaneyi yönetmek için.** Paneldeki **Kütüphaneyi yönet** düğmesi ayrı bir sekme açar:

- **Malzemeler:** arama, ada/kategoriye/tarihe göre sıralama, MatWeb sayfasına bağlantılar, her malzemenin ANSYS
  durumu. Malzeme seçildiğinde çıkan çubuktan seçilenler **ayrı bir XML olarak indirilebilir** veya kütüphaneden kaldırılabilir.
- **Kurulum ve ayarlar:** kütüphane dosyasının konumu ve ANSYS'e bağlama adımları. Eklenti ilk kurulduğunda bu sekme
  kendiliğinden açılır.

**Kategoriler.** Malzemeler kütüphane sayfasında kendi kategorilerinize ayrılabilir: listeden seçip **Kategoriye ekle**
ile mevcut bir kategoriye ekleyin ya da yeni bir kategori adı yazın. Bir malzeme birden fazla kategoride olabilir.
ANSYS'te bir kütüphane dosyasının içinde klasör bulunmadığından her kategori, **kendi adını taşıyan ayrı bir ANSYS
kütüphane dosyası** olarak yazılır (ör. `İndirilenler/ANSYS/Malzemeler/Alüminyum alaşımları.xml`) ve ANSYS'e ayrı bir
kütüphane olarak eklenir. Kategori dosyaları **otomatik indirilmez**; kategoriyi açıp **Kategoriyi ANSYS kütüphanesi
olarak indir**'e bastığınızda oluşur. Kategori son indirmeden sonra değişirse başlığında "İndirilen dosya güncel değil" uyarısı görünür.

Tarayıcılar eklentilerin yalnızca İndirilenler klasörünün içine yazmasına izin verdiği için konum, İndirilenler altında
bir alt klasör olarak seçilir (ör. `İndirilenler/ANSYS/Malzemeler/MatWeb_ANSYS_Kutuphanesi.xml`). Dosya her
güncellemede aynı yerde üzerine yazılır; ANSYS'e bir kez tanıtmak yeterlidir.

### ANSYS'e alma

Workbench → **Engineering Data** → **Engineering Data Sources** görünümünde listenin en altındaki boş satırın
*Location* sütunundaki **…** düğmesiyle `MatWeb_ANSYS_Kutuphanesi.xml` dosyasını kütüphane olarak ekleyin
(tek seferlik alım için: *File → Import Engineering Data*). Dosya güncellendiğinde kütüphaneyi yenilemek yeterlidir.

### ANSYS'e aktarılan özellikler

| MatWeb | ANSYS | Not |
|---|---|---|
| Density | Density | g/cc → kg/m³ |
| Modulus of Elasticity + Poissons Ratio | Elasticity (Isotropic) | ν yoksa Shear Modulus'tan türetilir; K ve G hesaplanır |
| Tensile Strength, Yield / Ultimate | Tensile Yield / Ultimate Strength | MPa → Pa |
| Compressive Yield Strength / Compressive Strength | Compressive Yield / Ultimate Strength | |
| CTE, linear | Coefficient of Thermal Expansion (Secant) + Zero-Thermal-Strain Reference Temperature | "@ 20–100 °C" aralıkları sıcaklık tablosuna çevrilir |
| Specific Heat Capacity | Specific Heat (Constant Pressure) | J/g-°C → J/kg-°C |
| Thermal Conductivity | Thermal Conductivity (Isotropic) | |
| Electrical Resistivity | Resistivity | ohm-cm → ohm-m |

- Yoğunluk, elastisite, özgül ısı ve ısıl iletkenlikte en az iki sıcaklık noktası varsa sıcaklık tablosu yazılır.
- Aralık olarak verilen değerlerde (ör. "670 – 1240 MPa") MatWeb'in verdiği ortalama, yoksa orta nokta alınır;
  bu durum malzemenin açıklamasına (Description) not düşülür.
- Kalınlığa bağlı değerler, sertlik ve kompozisyon ANSYS'te karşılığı olmadığından aktarılmaz (Genel XML'de vardır).
- Eşleme tablosu `extension/lib/ansys-writer.js` içindeki `FIELD_MAP`'tedir; yeni alan eklemek için oraya satır eklenir.

## Kurulum

Eklenti **Firefox**, **Google Chrome** ve **Microsoft Edge**'de çalışır. Paketler `npm run build` ile `dist/` klasöründe
üretilir: `Material_Converter-firefox-<sürüm>.zip` ve Chrome/Edge için `Material_Converter-chromium-<sürüm>.zip`.

### Firefox

1. Adres çubuğuna `about:debugging#/runtime/this-firefox` yazın.
2. **Geçici Eklenti Yükle… (Load Temporary Add-on…)** düğmesine basıp Firefox zip dosyasını seçin
   (geliştirirken doğrudan `extension/manifest.json` da seçilebilir).
3. Düğme araç çubuğunda görünmüyorsa: yapboz (Uzantılar) simgesi → **Material Converter** → *Araç çubuğuna sabitle*.

Geçici eklentiler Firefox kapanınca kaldırılır. Kalıcı kurulum için eklentinin Mozilla tarafından imzalanması gerekir
("listelenmemiş" imzalama ücretsizdir ve eklentiyi mağazada yayımlamaz; addons.mozilla.org geliştirici sayfası).

### Google Chrome

1. Chrome/Edge zip dosyasını bir klasöre çıkarın (Chrome zip'i doğrudan yükleyemez; klasör gerekir).
2. Adres çubuğuna `chrome://extensions` yazın, sağ üstten **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğe yükle** düğmesiyle çıkardığınız klasörü seçin.
4. Yapboz (Uzantılar) simgesi → **Material Converter** → raptiye simgesiyle araç çubuğuna sabitleyin.

### Microsoft Edge

1. Chrome/Edge zip dosyasını bir klasöre çıkarın.
2. Adres çubuğuna `edge://extensions` yazın, soldaki **Geliştirici modu**nu açın.
3. **Paketlenmemiş öğeyi yükle** düğmesiyle çıkardığınız klasörü seçin.
4. Uzantılar simgesi → **Material Converter** → *Araç çubuğunda göster*.

Chrome ve Edge'de paketlenmemiş eklenti tarayıcı yeniden başlatıldığında da yüklü kalır (tarayıcı geliştirici modu
eklentileri hakkında uyarı gösterebilir). Mağazada yayımlamak için: Chrome Web Store (tek seferlik geliştirici ücreti)
veya Microsoft Edge Add-ons (ücretsiz); ikisi de aynı Chrome/Edge zip dosyasını kabul eder.

Not: Tarayıcıda "Her dosyayı indirmeden önce nereye kaydedileceğini sor" ayarı açıksa ve kütüphane dosyası her
güncellemede kayıt penceresi açıyorsa bu ayarı kapatın.

## Genel XML biçimi

```xml
<Material source="MatWeb" sourceUrl="..." exportedAt="2026-10-02T12:00:00.000Z" formatVersion="1">
  <Name>Aluminum 7075-T6; 7075-T651</Name>
  <Categories><Category>Metal</Category>...</Categories>
  <Notes>...</Notes>
  <KeyWords><KeyWord>UNS A97075</KeyWord>...</KeyWords>
  <PropertyGroups>
    <PropertyGroup name="Mechanical Properties">
      <Property name="Tensile Strength, Ultimate">
        <DataPoint>
          <Metric value="572" unit="MPa" text="572 MPa"/>
          <English value="83000" unit="psi" text="83000 psi"/>
          <Comment>AA; Typical</Comment>
        </DataPoint>
        <DataPoint>
          <Metric qualifier="&gt;=" value="462" unit="MPa" text="&gt;= 462 MPa">
            <Condition name="Thickness" min="88.93" max="102" unit="mm"/>
          </Metric>
          ...
        </DataPoint>
      </Property>
    </PropertyGroup>
  </PropertyGroups>
</Material>
```

- Tek değer `value`, aralık `min` + `max` ile verilir; `>=`, `<=` gibi ifadeler `qualifier` özniteliğindedir.
- Sıcaklık/kalınlık gibi koşullar `Condition` öğeleridir.
- `text` özniteliği sayfadaki ham metni taşır; sayısal olmayan değerler (ör. "Yes") yalnızca `text` ile gelir.

## Proje yapısı

```
extension/
  manifest.json          Eklenti tanımı (Manifest V3; Firefox hâli — Chrome/Edge hâli derlemede üretilir)
  ui.css                 Ortak tasarım (renkler, düğmeler, etiketler; açık/koyu tema)
  popup.html/.js/.css    Araç çubuğu paneli: açık sayfadaki malzemeyi ekleme
  library.html/.js/.css  Kütüphane sayfası: Malzemeler ve Kurulum ve ayarlar sekmeleri
  background.js          İndirme ve rozet (Firefox: arka plan sayfası, Chrome/Edge: service worker)
  offscreen.html/.js     Yalnızca Chrome/Edge: service worker için indirilecek dosyanın adresini üretir
  lib/matweb-parser.js   MatWeb sayfasını DOM'dan okur (tarayıcıdan bağımsız)
  lib/xml-writer.js      Genel XML yazıcısı
  lib/ansys-writer.js    ANSYS Engineering Data (MatML 3.1) kütüphane yazıcısı ve alan eşlemesi
  lib/store.js           Kütüphane/ayar saklama, sıralama, uyarılar, dosya yolu (panel ve sayfa ortak)
  lib/ui.js              Simgeler, bildirim ve tarih biçimi yardımcıları
  icons/icon.svg
test/
  fixtures/*.htm         MatWeb yapısını taklit eden sentetik örnek sayfalar
  expected/*.xml         Beklenen çıktılar (genel XML + ANSYS kütüphanesi)
  reference/             ANSYS 2023 R1'den alınmış gerçek Engineering Data dışa aktarımı (biçim referansı)
  run.mjs                Ayrıştırıcıyı gerçek tarayıcıda (Playwright/Chromium) çalıştıran test
```

## Geliştirme

```bash
npm install            # yalnızca testler için (Playwright)
npm test               # fixture'ları dönüştürüp beklenen XML ile karşılaştırır
npm run test:update    # ayrıştırıcı bilerek değiştiyse beklenen çıktıları günceller
npm run lint           # Mozilla web-ext ile eklenti denetimi
npm run build          # dist/firefox, dist/chromium klasörleri ve yüklenebilir zip paketleri
```

Kaynak tektir (`extension/`); `scripts/build.mjs` Chrome/Edge paketi için manifest'i dönüştürür (service worker,
PNG simgeler, `offscreen` izni) ve Firefox paketinden yalnızca Chrome'a ait dosyaları çıkarır.

### Gerçek Firefox'ta uçtan uca test

`test/firefox/e2e.py`, eklentiyi gerçek bir Firefox'a yükler, araç çubuğu düğmesine tıklar, paneldeki
düğmelere basar ve indirilen dosyaları kontrol eder. `www.matweb.com` istekleri yerel sahte sunucuya
(`test/firefox/fake_matweb.py`) yönlendirildiği için internet gerekmez.

```bash
pip install selenium
# Firefox ve geckodriver yoksa (Linux): micromamba create -p ./ffenv -c conda-forge firefox geckodriver
FIREFOX_BIN=./ffenv/bin/firefox GECKODRIVER=./ffenv/bin/geckodriver xvfb-run -a python test/firefox/e2e.py
```

### Gerçek Chromium'da (Chrome/Edge paketi) uçtan uca test

`test/chromium/e2e.mjs`, Chrome/Edge paketini gerçek Chromium'a yükler; sayfa okuma, service worker + offscreen belge ile
indirme, alt klasöre/üzerine yazma, kütüphane sayfası ve kategorileri dener. Chromium'da araç çubuğu düğmesine otomatik
tıklanamadığından test, eklentinin MatWeb için site izni eklenmiş bir kopyasını kullanır ve paneli ayrı sekmede açar.

```bash
npm run build -- --no-zip
xvfb-run -a node test/chromium/e2e.mjs      # CHROMIUM_BIN ile tarayıcı yolu verilebilir
```

Kendi kaydettiğiniz MatWeb sayfalarını `test/private/` klasörüne koyarsanız (git'e girmez) `npm test`
bunları da dönüştürüp `test/private/out/` altına yazar. MatWeb içeriği telif kapsamında olduğundan
gerçek sayfalar depoya eklenmez.
