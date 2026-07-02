import { cn } from '@/lib/utils';
import { SectionLabel } from './SectionLabel';

/**
 * A triage tile routes the user into work; it is not a vanity counter
 * (anti-patterns.md, component-rules.md "Metric tile"). It is a button: clicking
 * it filters/segments the list. The count is large and tabular, the label is
 * muted, and the optional sub-line carries semantic color only on the delta.
 * Selected tiles get the lime left marker and a stronger border.
 */
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_VAR: Record<Tone, string> = {
  neutral: '--cc-text-muted',
  success: '--cc-success',
  warning: '--cc-warning',
  danger: '--cc-danger-pill-text',
  info: '--cc-info',
};

interface TriageTileProps {
  label: string;
  count: number | string;
  sub?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}

export function TriageTile({ label, count, sub, tone = 'neutral', active, onClick }: TriageTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col items-start gap-1 rounded-cc-xl border bg-cc-surface px-5 py-4 text-left shadow-card transition-colors duration-base ease-glide',
        'hover:border-cc-border-interactive',
        active ? 'border-cc-accent' : 'border-cc-border-subtle',
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-pill bg-cc-accent"
        />
      )}
      <span className="cc-num text-2xl font-semibold leading-none text-cc-text-primary">{count}</span>
      <SectionLabel>{label}</SectionLabel>
      {sub && (
        <span className="text-xs" style={{ color: `var(${TONE_VAR[tone]})` }}>
          {sub}
        </span>
      )}
    </button>
  );
}
