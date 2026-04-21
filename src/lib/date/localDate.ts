const BUSINESS_TIME_ZONE = 'America/New_York';
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const LOCAL_DISPLAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const LOCAL_DATE_FORMAT = 'yyyy-MM-dd';
export { BUSINESS_TIME_ZONE };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function partsToLocalDate(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getPartsFromDate(date: Date): { year: number; month: number; day: number } {
  const parts = LOCAL_DATE_FORMATTER.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function shiftLocalDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return partsToLocalDate(getPartsFromDate(utc));
}

export function formatLocalDate(date: Date): string {
  return partsToLocalDate(getPartsFromDate(date));
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function todayLocalDate(now = new Date()): string {
  return formatLocalDate(now);
}

export function addDaysLocalDate(base: Date | string, days: number): string {
  return shiftLocalDate(typeof base === 'string' ? extractLocalDate(base) : formatLocalDate(base), days);
}

export function localDateToNoonIso(value: string): string {
  return `${extractLocalDate(value)}T12:00:00.000`;
}

export function extractLocalDate(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function formatLocalDateDisplay(value: string | null | undefined): string {
  const localDate = extractLocalDate(value);
  if (!localDate) return '';
  return LOCAL_DISPLAY_FORMATTER.format(parseLocalDate(localDate));
}

export function differenceFromTodayInLocalDays(value: string | null | undefined, now = new Date()): number | null {
  const localDate = extractLocalDate(value);
  if (!localDate) return null;
  const [year, month, day] = localDate.split('-').map(Number);
  const today = extractLocalDate(todayLocalDate(now)).split('-').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
  const todayUtc = Date.UTC(today[0], today[1] - 1, today[2], 12, 0, 0);
  return Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}
