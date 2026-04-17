import { addDays, format, parseISO, startOfDay } from 'date-fns';

export const LOCAL_DATE_FORMAT = 'yyyy-MM-dd';
export const BUSINESS_TIME_ZONE = 'America/New_York';

export function formatLocalDate(date: Date): string {
  return format(date, LOCAL_DATE_FORMAT);
}

export function parseLocalDate(value: string): Date {
  return startOfDay(parseISO(value));
}

export function todayLocalDate(now = new Date()): string {
  return formatLocalDate(now);
}

export function addDaysLocalDate(base: Date | string, days: number): string {
  const date = typeof base === 'string' ? parseLocalDate(base) : startOfDay(base);
  return formatLocalDate(addDays(date, days));
}

export function localDateToNoonIso(value: string): string {
  return `${value}T12:00:00.000`;
}

export function extractLocalDate(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function formatLocalDateDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const date = parseLocalDate(extractLocalDate(value));
  return date.toLocaleDateString('en-US', { timeZone: BUSINESS_TIME_ZONE });
}

export function differenceFromTodayInLocalDays(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const date = parseLocalDate(extractLocalDate(value));
  const today = startOfDay(now);
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
