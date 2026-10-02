# malzeme_donusturucu

MatWeb malzeme veri sayfalarını tek tıkla **ANSYS Workbench Engineering Data** kütüphanesine (XML) ekleyen
tarayıcı eklentisi.

- Tamamen yerel çalışır: sunucu, Python kurulumu, OCR veya yapay zekâ modeli yoktur.
- Ayrıştırma doğrudan sayfanın HTML tablosundan yapıldığı için değerler birebir aktarılır.
- Eklenen malzemeler eklentinin hafızasında tutulur; hepsi **tek bir kütüphane dosyasına** yazılır.

Şu an **Firefox** için hazırdır; Chrome ve Edge desteği sonraki adımdır.

## Kullanım

1. Firefox'ta MatWeb'de bir malzemenin veri sayfasını açın (`matweb.com/search/DataSheet.aspx?...`).
2. Araç çubuğundaki **MAT/XML** düğmesine tıklayın, açılan panelde **Kütüphaneye ekle**'ye basın.
3. `İndirilenler` klasörüne `MatWeb_ANSYS_Kutuphanesi.xml` yazılır. Her eklemede aynı dosya güncellenir
   (paneldeki "otomatik güncelle" kutusu kapatılırsa yalnızca **ANSYS kütüphanesini indir** ile yazılır).
4. Aynı malzeme tekrar eklenirse kopya oluşmaz, mevcut kayıt güncellenir. ✕ ile malzeme çıkarılabilir.
5. **Genel XML** düğmesi, sayfadaki tüm veriyi (sertlik, kompozisyon, kalınlığa bağlı değerler dahil)
   ayrıntılı genel XML olarak ayrıca indirir.

Düğme üzerindeki rozet kütüphanedeki malzeme sayısını gösterir.

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

## Firefox'a yükleme (geliştirme / deneme)

1. Firefox adres çubuğuna `about:debugging#/runtime/this-firefox` yazın.
2. **Geçici Eklenti Yükle… (Load Temporary Add-on…)** düğmesine basın.
3. Bu depodaki `extension/manifest.json` dosyasını seçin.
4. Düğme araç çubuğunda görünmüyorsa: yapboz (Uzantılar) simgesi → "MatWeb → ANSYS" → *Araç çubuğuna sabitle*.

Geçici eklentiler Firefox kapanınca kaldırılır. Kalıcı kurulum için eklentinin Mozilla tarafından
imzalanması gerekir ("listelenmemiş" imzalama ücretsizdir ve eklentiyi mağazada yayımlamaz):
`npm run build:firefox` ile paket oluşturulup addons.mozilla.org geliştirici sayfasından imzalatılabilir.

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
  manifest.json          Eklenti tanımı (Manifest V3)
  popup.html/.js/.css    Araç çubuğu paneli: sayfayı okuma, kütüphane yönetimi
  background.js          İndirme ve rozet
  lib/matweb-parser.js   MatWeb sayfasını DOM'dan okur (tarayıcıdan bağımsız)
  lib/xml-writer.js      Genel XML yazıcısı
  lib/ansys-writer.js    ANSYS Engineering Data (MatML 3.1) kütüphane yazıcısı ve alan eşlemesi
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
```

Kendi kaydettiğiniz MatWeb sayfalarını `test/private/` klasörüne koyarsanız (git'e girmez) `npm test`
bunları da dönüştürüp `test/private/out/` altına yazar. MatWeb içeriği telif kapsamında olduğundan
gerçek sayfalar depoya eklenmez.
