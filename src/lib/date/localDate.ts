import { format, parseISO, startOfDay } from 'date-fns';

export const LOCAL_DATE_FORMAT = 'yyyy-MM-dd';

export function formatLocalDate(date: Date): string {
  return format(date, LOCAL_DATE_FORMAT);
}

export function parseLocalDate(value: string): Date {
  return startOfDay(parseISO(value));
}

export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

export function addDaysLocalDate(base: Date | string, days: number): string {
  const date = typeof base === 'string' ? parseLocalDate(base) : startOfDay(base);
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
}

export function localDateToNoonIso(value: string): string {
  return `${value}T12:00:00.000`;
}
