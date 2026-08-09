# data/

Everything in this folder except this README is **git-ignored on purpose** — it is
the account book (customer names, contacts, visit notes, Top 25 flags).

| File | What it is |
|---|---|
| `legacy-territory-lists.json` | Raw territory lists exported out of Google Lists. Input to the converter. |
| `accounts.json` | Generated account book, keyed by Google place ID. Portable / importable. |
| `accounts.js` | Generated. What `route-board.html` loads (a plain `<script>`, so it works over `file://`). |

## Rebuilding

```
powershell -ExecutionPolicy Bypass -File tools\build-book.ps1
```

This regenerates `accounts.json` + `accounts.js` and stamps a cache-busting
version onto the `<script>` tag in `route-board.html`.

The build refuses to write if more than 10% of rows lack a Google place ID, so a
malformed export cannot quietly replace a good book. Pass `-Force` to override.

## Or skip the script

The Route Board's **Data** panel imports both shapes directly in the browser —
either a generated `accounts.json`, or a raw territory list in the
`{"Territory": [[name, note, mapUrl, [tags]]]}` shape. An imported book is stored
in the browser and takes precedence over `accounts.js` until you revert.

## Why place IDs

Accounts are keyed on the feature ID inside each Google Maps URL
(`!1s0x865b39…:0xa3a6c1…`). It survives renames, reordering and re-exports, so
day assignments and Salesforce links stay attached to the right clinic when the
list changes. Row position does not.
