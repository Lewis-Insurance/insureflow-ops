# ACORD blank field inventories

Machine-extracted AcroForm inventories (`name`, `type`, `page`, `rect`) for the
licensed commercial-application blanks. These are the mapping source for each
form engine (the acord25 `fieldMap.ts` pattern). **The licensed PDFs themselves
are NEVER committed** - they live in the private `acord-templates` storage
bucket, byte-pinned by the engines at fill time.

| Form | Edition | Pages | Fields | Naming | Normalized sha256[:12] | Source |
|------|---------|-------|--------|--------|------------------------|--------|
| 125  | 2016/03 | 4 | 603 | semantic (`Producer_FullName_A`) | `6d685e5b13f4` | Desktop drop 2026-07-06, qpdf-repaired + decrypted |
| 126  | 2009/08 | 4 | 279 | generic (`Text1`...) - coordinate map | `1c9f49d8fef9` | Desktop drop 2026-07-06, decrypted |
| 127  | 2015/12 | 4 | 636 | semantic | `e3cceacecf19` | Desktop drop 2026-07-06, decrypted |
| 130  | 2010/05 | 4 | 486 | generic - coordinate map | `49a7254578f8` | Dec-2024 bucket upload (Desktop copy was print-only), decrypted |
| 140  | 2014/12 | 3 | 355 | semantic | `650c448a0b07` | Desktop drop 2026-07-06, decrypted |
| 131  | 2009/10 | 5 | 405 | generic - coordinate map | `7397d384d691` | Desktop drop 2026-07-06, decrypted |

Provenance notes:

- The ACORD-portal downloads ship encrypted (AES, empty user password) and in a
  hybrid XFA/AcroForm construction. Normalization = `qpdf --decrypt` (lossless;
  also repairs damaged xrefs, which the 125 download needed). Engines pin the
  NORMALIZED bytes; the original download hashes are recorded in
  `acord_templates.license_notes`.
- `rect` is `[x, y, width, height]` in PDF points, origin bottom-left, per the
  field's first widget; `page` is 0-based.
- Semantic-named forms (125/127/140) map by name. Generic-named forms
  (126/130/131) map by page + coordinates against the printed form - slower to
  build, identical at fill time.
- Still missing: a FILLABLE FL UM/UIM supplement (the ACORD 61 FL on hand is a
  print-only version, 0 fields). Tracked in docs/Commercial-Lines-Blockers.md.
