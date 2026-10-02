# Store listing texts

Copy-paste texts for the Chrome Web Store, Firefox Add-ons (AMO) and Microsoft Edge Add-ons. Images are in
[`images/`](images/).

| File | Use |
|---|---|
| `screenshot-1-add.png` … `screenshot-5-warnings.png` | Screenshots, 1280×800 (Chrome: up to 5; Firefox: any; Edge: up to 10) |
| `promo-small-440x280.png` | Chrome "Small promo tile" (440×280); Edge "Small promotional tile" |
| `promo-marquee-1400x560.png` | Chrome "Marquee promo tile" (1400×560, optional); Edge "Large promotional tile" |
| `store-icon-128.png` | Store icon 128×128 (Chrome / Edge) |

---

## Name

```
Material Converter
```

## Short description / Summary

Chrome "Summary" (max 132 characters) and Firefox "Summary" (max 250 characters):

```
Turn MatWeb material data sheets into an ANSYS Engineering Data library in one click. Not affiliated with MatWeb or ANSYS.
```

Turkish:

```
MatWeb malzeme sayfalarını tek tıkla ANSYS Engineering Data kütüphanesine aktarın. MatWeb ve ANSYS ile bağlantılı değildir.
```

## Detailed description (English)

```
Material Converter adds material data sheets from MatWeb to an ANSYS Engineering Data library — in one click.

Copying material properties into ANSYS by hand is slow and error-prone: unit conversions, ranges, temperature-dependent values, typos. Open a material page on MatWeb, click the Material Converter button and press "Add to library". The material is written to an ANSYS library file that Workbench reads directly.

FEATURES
• One-click import from any MatWeb material data sheet
• Ready for ANSYS: values are converted to SI units and written in the Engineering Data format — density, elasticity (E, ν), yield and ultimate strength, thermal expansion with temperature table, specific heat, thermal conductivity and electrical resistivity
• One library file, always up to date: register it in ANSYS once, then just refresh
• Your own categories: group materials and download any category as its own ANSYS library, named after the category
• Smart warnings when a page lacks data ANSYS needs, or when it is a series overview with averaged values
• Library manager: search, sort by name, category or date, open the original data sheet with one click, export a selection
• Full data export: hardness, chemical composition and conditional values as a separate detailed XML
• English and Turkish interface, light and dark theme

PRIVACY
Everything runs locally in your browser. No account, no server, no analytics, no tracking. The extension only reads the page you have open, and only when you click its button.

NOTE
Browsers only let extensions save files inside the Downloads folder, so the library is saved to a subfolder of Downloads that you choose.

Material Converter is an independent project and is not affiliated with, endorsed by or sponsored by MatWeb, LLC or ANSYS, Inc. MatWeb and ANSYS are trademarks of their respective owners. Please use the data in accordance with the source website's terms of use, and always review material properties before using them in an engineering analysis.

Source code (MIT): https://github.com/Omrndr/Material_Converter
```

## Detailed description (Turkish)

```
Material Converter, MatWeb malzeme sayfalarını tek tıkla ANSYS Engineering Data kütüphanesine ekler.

Malzeme özelliklerini ANSYS'e elle aktarmak yavaş ve hataya açıktır: birim dönüşümleri, aralıklar, sıcaklığa bağlı değerler, yazım hataları. MatWeb'de bir malzeme sayfası açın, Material Converter düğmesine tıklayın ve "Kütüphaneye ekle"ye basın. Malzeme, Workbench'in doğrudan okuduğu bir ANSYS kütüphane dosyasına yazılır.

ÖZELLİKLER
• Her MatWeb malzeme sayfasından tek tıkla aktarım
• ANSYS'e hazır: değerler SI birimlerine çevrilir ve Engineering Data biçiminde yazılır — yoğunluk, elastisite (E, ν), akma ve çekme dayanımı, sıcaklık tablolu ısıl genleşme, özgül ısı, ısıl iletkenlik ve elektriksel direnç
• Hep güncel tek kütüphane dosyası: ANSYS'e bir kez tanıtın, sonra yalnızca yenileyin
• Kendi kategorileriniz: malzemeleri gruplayın, her kategoriyi kendi adını taşıyan ayrı bir ANSYS kütüphanesi olarak indirin
• Sayfada ANSYS için gereken veri eksikse ya da sayfa ortalama değerli bir seri özetiyse uyarı
• Kütüphane yönetimi: arama, ada/kategoriye/tarihe göre sıralama, kaynak sayfayı tek tıkla açma, seçilenleri ayrı dosya olarak indirme
• Tüm veriyi dışa aktarma: sertlik, kimyasal bileşim ve koşullu değerler ayrı ayrıntılı XML olarak
• Türkçe ve İngilizce arayüz, açık ve koyu tema

GİZLİLİK
Her şey tarayıcınızda, yerel olarak çalışır. Hesap, sunucu, analiz ya da izleme yoktur. Eklenti yalnızca açık olan sayfayı ve yalnızca düğmesine tıkladığınızda okur.

NOT
Tarayıcılar eklentilerin yalnızca İndirilenler klasörüne dosya kaydetmesine izin verdiği için kütüphane, İndirilenler altında seçtiğiniz bir alt klasöre kaydedilir.

Material Converter bağımsız bir projedir; MatWeb, LLC veya ANSYS, Inc. ile bağlantılı değildir ve onlar tarafından desteklenmez. MatWeb ve ANSYS ilgili sahiplerinin ticari markalarıdır. Verileri kaynak sitenin kullanım koşullarına uygun kullanın ve mühendislik analizinde kullanmadan önce malzeme özelliklerini mutlaka kontrol edin.

Kaynak kod (MIT): https://github.com/Omrndr/Material_Converter
```

---

## Chrome Web Store — "Privacy practices" tab

**Single purpose description**

```
Convert the material data sheet shown on the current MatWeb page into an ANSYS Engineering Data library file (XML), and manage the user's local library of converted materials.
```

**Permission justifications**

| Field | Text |
|---|---|
| activeTab | `Reads the material property table of the MatWeb page in the active tab, only after the user clicks the extension's toolbar button.` |
| scripting | `Injects the page reader into the active MatWeb tab (granted via activeTab) to parse the material data sheet the user is viewing.` |
| downloads | `Saves the generated ANSYS library XML files to a subfolder of the user's Downloads folder chosen in the settings.` |
| storage | `Stores the user's material library, categories and settings locally in the browser.` |
| offscreen | `The background service worker cannot create blob URLs; an offscreen document creates the blob URL for the XML file that is then downloaded.` |

**Remote code:** `No, I am not using remote code.`

**Data usage:** do not tick any data type (the extension collects no user data). Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/Omrndr/Material_Converter/blob/main/PRIVACY.md
```

**Category:** Productivity → Tools (or "Developer Tools"). **Language:** English (add Turkish as a second language
if you like).

## Firefox Add-ons (AMO)

- **Distribution:** "On this site" (listed).
- **Platforms:** Firefox desktop only (do not select Firefox for Android — it has not been tested there).
- **Source code:** "No" — the package contains plain, unminified JavaScript; no build tool changes the code.
- **Categories:** Other; Download Management.
- **License:** MIT License.
- **Privacy policy:** paste the contents of `PRIVACY.md` (optional for AMO, recommended).
- **Support / homepage:** `https://github.com/Omrndr/Material_Converter`
- **Notes to reviewer:**

```
The extension only runs when the user clicks the toolbar button on a MatWeb (matweb.com) material data sheet. It reads the property table from the DOM (lib/matweb-parser.js), converts the values and writes an ANSYS Engineering Data XML file via the downloads API. No network requests, no remote code, no data collection. All code is plain, unminified JavaScript. To test: open any material data sheet on https://www.matweb.com/ (e.g. search "7075-T6"), click the toolbar button and press "Add to library"; the file appears in Downloads.
```

## Microsoft Edge Add-ons (optional)

Use the Chrome/Edge package and the same texts and images as for the Chrome Web Store. Edge does not charge a
registration fee.
