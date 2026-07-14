// Minimal, dependency-free ZIP writer (STORE method, no compression).
//
// Used to bundle a batch of already-built PDF certificates into one download.
// PDFs are already compressed, so storing (no deflate) is both correct and the
// fastest option, and it keeps us off any third-party zip dependency (this repo
// has a documented history of Windows npm-install pruning Linux-only lockfile
// deps and breaking CI, so adding packages here is avoided).
//
// Scope: single-disk archives under 4 GB, which every realistic batch of COIs
// is. No ZIP64, no compression, no encryption. Filenames are written UTF-8 with
// the language-encoding flag set so non-ASCII holder names round-trip.

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Build a ZIP archive (STORE) from the given entries. Returns the raw bytes,
 * ready to wrap in a Blob of type 'application/zip'.
 */
export function createZipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const UTF8_FLAG = 0x0800; // general-purpose bit 11: filename is UTF-8

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30 bytes + name) followed by the stored data.
    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed to extract
    lv.setUint16(6, UTF8_FLAG, true); // general purpose bit flag
    lv.setUint16(8, 0, true); // compression method: 0 = store
    lv.setUint16(10, 0, true); // mod time (fixed; deterministic)
    lv.setUint16(12, 0x21, true); // mod date (1980-01-01)
    lv.setUint32(14, crc, true); // crc-32
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // file name length
    lv.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    // Central directory record (46 bytes + name).
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central file header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed to extract
    cv.setUint16(8, UTF8_FLAG, true); // general purpose bit flag
    cv.setUint16(10, 0, true); // compression method
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0x21, true); // mod date
    cv.setUint32(16, crc, true); // crc-32
    cv.setUint32(20, size, true); // compressed size
    cv.setUint32(24, size, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true); // file name length
    cv.setUint16(30, 0, true); // extra field length
    cv.setUint16(32, 0, true); // file comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal file attributes
    cv.setUint32(38, 0, true); // external file attributes
    cv.setUint32(42, offset, true); // relative offset of local header
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const centralOffset = offset;

  // End of central directory record (22 bytes, no comment).
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central dir signature
  ev.setUint16(4, 0, true); // number of this disk
  ev.setUint16(6, 0, true); // disk where central directory starts
  ev.setUint16(8, entries.length, true); // central dir records on this disk
  ev.setUint16(10, entries.length, true); // total central dir records
  ev.setUint32(12, centralSize, true); // size of central directory
  ev.setUint32(16, centralOffset, true); // offset of central directory
  ev.setUint16(20, 0, true); // comment length

  // Concatenate: [local+data]* [central]* [eocd]
  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const l of locals) {
    out.set(l, pos);
    pos += l.length;
  }
  for (const c of centrals) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(eocd, pos);
  return out;
}
