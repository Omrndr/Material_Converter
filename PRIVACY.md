# Privacy Policy — Material Converter

_Last updated: 2 October 2026_

Material Converter is a browser extension that converts material data sheets you open on MatWeb into ANSYS
Engineering Data library files. This policy explains what the extension does with data.

## Summary

**Material Converter does not collect, transmit, sell or share any personal data.** Everything happens locally in your
browser. The extension has no servers, no analytics and no tracking.

## What the extension reads

- **The current page, only when you click the extension's toolbar button**, and only to read the material property
  table of a MatWeb data sheet. The extension does not read any other websites or tabs, and does not run in the
  background on pages you visit.

## What the extension stores

- The materials you add to your library (name, MatWeb page address, the parsed property values), your categories and
  your settings (download subfolder, file name, sorting).
- This data is stored with the browser's extension storage (`storage.local`) **on your own computer**. It is never
  sent anywhere. Removing the extension deletes it.

## What the extension creates

- XML files (your ANSYS library, category libraries and optional detailed exports), saved to your **Downloads** folder
  using the browser's download feature.

## Permissions

| Permission | Why it is needed |
|---|---|
| `activeTab` | To read the open MatWeb page after you click the toolbar button. |
| `scripting` | To run the page reader on that tab. |
| `downloads` | To save the ANSYS library XML files to your Downloads folder. |
| `storage` | To remember your library, categories and settings locally. |
| `offscreen` (Chrome/Edge only) | To prepare the XML file for download, because the extension's background service worker cannot do this itself. |

## Third parties

The extension does not communicate with any third-party service. MatWeb pages are loaded by your browser as usual when
you visit them; the extension only reads the page you already have open.

## Contact

Questions about this policy: open an issue at <https://github.com/Omrndr/Material_Converter/issues>.
