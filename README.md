# malzeme_donusturucu

MatWeb malzeme veri sayfalarını tek tıkla **XML** dosyasına dönüştüren tarayıcı eklentisi.

- Tamamen yerel çalışır: sunucu, Python kurulumu, OCR veya yapay zekâ modeli yoktur.
- Ayrıştırma doğrudan sayfanın HTML tablosundan yapıldığı için değerler birebir aktarılır.
- Eklentinin toplam boyutu birkaç KB'dır.

Şu an **Firefox** için hazırdır; Chrome ve Edge desteği sonraki adımdır.

## Kullanım

1. Firefox'ta MatWeb'de bir malzemenin veri sayfasını açın (`matweb.com/search/DataSheet.aspx?...`).
2. Araç çubuğundaki **MAT/XML** düğmesine tıklayın.
3. `İndirilenler` klasörüne malzeme adıyla bir `.xml` dosyası iner (ör. `Aluminum_7075-T6_7075-T651.xml`).
   Düğmede kısa süre yeşil ✓ görünür. MatWeb dışı bir sayfada tıklanırsa uyarı verilir.

## Firefox'a yükleme (geliştirme / deneme)

1. Firefox adres çubuğuna `about:debugging#/runtime/this-firefox` yazın.
2. **Geçici Eklenti Yükle… (Load Temporary Add-on…)** düğmesine basın.
3. Bu depodaki `extension/manifest.json` dosyasını seçin.
4. Düğme araç çubuğunda görünmüyorsa: yapboz (Uzantılar) simgesi → "MatWeb → XML" → *Araç çubuğuna sabitle*.

Geçici eklentiler Firefox kapanınca kaldırılır. Kalıcı kurulum için eklentinin Mozilla tarafından
imzalanması gerekir ("listelenmemiş" imzalama ücretsizdir ve eklentiyi mağazada yayımlamaz):
`npm run build:firefox` ile paket oluşturulup addons.mozilla.org geliştirici sayfasından imzalatılabilir.

## XML biçimi

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
  manifest.json          Eklenti tanımı (Manifest V3)
  background.js          Düğme tıklaması, sayfaya betik ekleme, indirme
  lib/matweb-parser.js   MatWeb sayfasını DOM'dan okur (tarayıcıdan bağımsız)
  lib/xml-writer.js      Okunan veriyi XML'e yazar
  icons/icon.svg
test/
  fixtures/*.htm         MatWeb yapısını taklit eden sentetik örnek sayfalar
  expected/*.xml         Beklenen çıktılar
  run.mjs                Ayrıştırıcıyı gerçek tarayıcıda (Playwright/Chromium) çalıştıran test
```

## Geliştirme

```bash
npm install            # yalnızca testler için (Playwright)
npm test               # fixture'ları dönüştürüp beklenen XML ile karşılaştırır
npm run test:update    # ayrıştırıcı bilerek değiştiyse beklenen çıktıları günceller
npm run lint           # Mozilla web-ext ile eklenti denetimi
```

Kendi kaydettiğiniz MatWeb sayfalarını `test/private/` klasörüne koyarsanız (git'e girmez) `npm test`
bunları da dönüştürüp `test/private/out/` altına yazar. MatWeb içeriği telif kapsamında olduğundan
gerçek sayfalar depoya eklenmez.
