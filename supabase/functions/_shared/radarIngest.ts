export type RadarKind = "cancel" | "swo";

export interface RadarRow {
  employer_name?: string;
  fein?: string;
  county?: string;
  policy_number?: string;
  carrier?: string;
  expiration_date?: string;
  class_code?: string;
  estimated_premium?: number;
  agency_of_record?: string;
  peo_client?: boolean;
  [key: string]: unknown;
}

const aliases: Record<string, keyof RadarRow> = {
  employer: "employer_name", employername: "employer_name", insuredname: "employer_name",
  fein: "fein", federalemployeridentificationnumber: "fein",
  county: "county", policynumber: "policy_number", policy: "policy_number",
  carrier: "carrier", insurancecompany: "carrier", expirationdate: "expiration_date",
  cancellationdate: "expiration_date", classcode: "class_code", governingclasscode: "class_code",
  estimatedpremium: "estimated_premium", premium: "estimated_premium",
  agencyofrecord: "agency_of_record", agentofrecord: "agency_of_record", peoclient: "peo_client",
};

export function normalizeHeader(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalizeRow(input: Record<string, unknown>): RadarRow {
  const row: RadarRow = {};
  for (const [header, value] of Object.entries(input)) {
    const key = aliases[normalizeHeader(header)];
    if (key) (row as Record<string, unknown>)[key] = value;
  }
  const clean = (v: unknown) => String(v ?? "").trim() || undefined;
  row.employer_name = clean(row.employer_name);
  row.fein = clean(row.fein)?.replace(/\D/g, "");
  row.county = clean(row.county);
  row.policy_number = clean(row.policy_number);
  row.carrier = clean(row.carrier);
  row.class_code = clean(row.class_code)?.replace(/\D/g, "");
  row.agency_of_record = clean(row.agency_of_record);
  row.expiration_date = normalizeDate(row.expiration_date);
  const premium = Number(String(row.estimated_premium ?? "").replace(/[$,]/g, ""));
  row.estimated_premium = Number.isFinite(premium) && premium >= 0 ? premium : undefined;
  row.peo_client = /^(true|yes|y|1)$/i.test(String(row.peo_client ?? ""));
  return row;
}

export function validateRow(row: RadarRow): string[] {
  const errors: string[] = [];
  if (!row.employer_name) errors.push("employer_name is required");
  if (row.employer_name && row.employer_name.length > 300) errors.push("employer_name exceeds 300 characters");
  if (row.fein && !/^\d{9}$/.test(row.fein)) errors.push("fein must contain 9 digits");
  if (!row.policy_number && !(row.county && row.expiration_date)) {
    errors.push("policy_number or county plus expiration_date is required");
  }
  if (row.expiration_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiration_date)) {
    errors.push("expiration_date is invalid");
  } else if (row.expiration_date && !isValidCalendarDate(row.expiration_date)) {
    errors.push("expiration_date is invalid");
  }
  return errors;
}

export function parseCsv(text: string): Record<string, unknown>[] {
  const records: string[][] = [];
  let record: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { record.push(field); field = ""; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = "";
      if (record.some((value) => value.length)) records.push(record);
      record = [];
    } else field += char;
  }
  record.push(field);
  if (record.some((value) => value.length)) records.push(record);
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  const headers = records.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim()) ?? [];
  if (!headers.length) return [];
  return records.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sourceRowHash(kind: RadarKind, row: RadarRow): Promise<string> {
  const stable = [kind, row.employer_name, row.fein, row.county, row.policy_number, row.carrier,
    row.expiration_date, row.class_code, row.estimated_premium, row.agency_of_record,
    row.peo_client].map((value) => String(value ?? "").trim().toUpperCase()).join("|");
  return sha256Hex(stable);
}

export function validateRawRow(row: Record<string, unknown>): void {
  const entries = Object.entries(row);
  if (entries.length > 100) throw new Error("A row exceeds the 100-column limit");
  const encoded = JSON.stringify(row);
  if (encoded.length > 100_000) throw new Error("A row exceeds the 100 KB limit");
  if (entries.some(([, value]) => String(value ?? "").length > 10_000)) {
    throw new Error("A cell exceeds the 10,000-character limit");
  }
}

export function normalizeEntity(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]/g, "");
}

export function preflightXlsx(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0) {
    throw new Error("Malformed or multi-disk XLSX archive");
  }
  const expectedEntries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (expectedEntries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff ||
      directoryOffset + directorySize > eocd) throw new Error("ZIP64 or malformed XLSX is unsupported");
  let entries = 0, worksheets = 0, totalCompressed = 0, totalUncompressed = 0;
  let offset = directoryOffset;
  while (entries < expectedEntries) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Malformed XLSX central directory");
    const flags = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if ((flags & 1) || compressed === 0xffffffff || uncompressed === 0xffffffff) throw new Error("Encrypted or ZIP64 XLSX is unsupported");
    if (offset + 46 + nameLength + extraLength + commentLength > eocd) throw new Error("Malformed XLSX central directory");
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name.startsWith("xl/worksheets/") && name.endsWith(".xml")) worksheets++;
    totalCompressed += compressed; totalUncompressed += uncompressed; entries++;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== directoryOffset + directorySize || !entries || worksheets !== 1) throw new Error("XLSX must contain exactly one worksheet");
  if (totalUncompressed > 100_000_000 || totalUncompressed > Math.max(totalCompressed * 100, 1_000_000)) {
    throw new Error("XLSX expansion exceeds safety limits");
  }
}

export function dedupKey(row: RadarRow): string {
  const policy = normalizeEntity(row.policy_number);
  const carrier = normalizeEntity(row.carrier);
  if (policy && carrier) return `policy:${policy}:${carrier}:${row.expiration_date ?? "unknown-term"}`;
  return `employer:${normalizeEntity(row.employer_name)}:${normalizeEntity(row.county)}:${row.expiration_date ?? ""}`;
}

function normalizeDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 1) {
    const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(value)));
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return text;
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
