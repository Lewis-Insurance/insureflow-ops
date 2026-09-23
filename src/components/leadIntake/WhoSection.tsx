/**
 * Who is asking. The top of the New Lead page.
 *
 * A name is the only required field. Everything else here is what the office would have
 * to phone back for, and nothing more. Personal takes one Name box because that is how
 * the office says it out loud; the page splits it on the last space at save time, since
 * leads.first_name and leads.last_name are both NOT NULL.
 */

import type { ReactNode, RefObject } from 'react';
import { Building2, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionLabel } from '@/components/cc';
import { formatPhoneForDisplay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { INTAKE_INPUT_CLASS, INTAKE_LABEL_CLASS } from './LineFieldInput';

export type IntakeMode = 'personal' | 'commercial';

export interface WhoValue {
  mode: IntakeMode;
  /** Personal only. One box, split on the last space at save time. */
  name: string;
  /** Commercial only. Goes to leads.company_name. */
  businessName: string;
  /** Commercial only. Goes to leads.first_name and leads.last_name. */
  contactName: string;
  phone: string;
  email: string;
  town: string;
  source: string;
}

export const EMPTY_WHO: WhoValue = {
  mode: 'personal',
  name: '',
  businessName: '',
  contactName: '',
  phone: '',
  email: '',
  town: '',
  source: '',
};

/** How the office actually answers the question, in the order they say it. */
export const LEAD_SOURCE_OPTIONS = [
  { value: 'referral', label: 'Referral' },
  { value: 'existing_customer', label: 'Existing customer' },
  { value: 'walk_in', label: 'Walk in' },
  { value: 'phone_call', label: 'Called the office' },
  { value: 'website', label: 'Website' },
  { value: 'google', label: 'Google' },
  { value: 'social', label: 'Facebook or Instagram' },
  { value: 'mailer', label: 'Mailer' },
  { value: 'other', label: 'Other' },
];

/** The name the duplicate check and the required field both work from. */
export function whoPrimaryName(who: WhoValue): string {
  return (who.mode === 'commercial' ? who.businessName : who.name).trim();
}

/**
 * Split a typed name on the LAST space. "Mary Beth Sorensen" is Mary Beth / Sorensen.
 * A single word gives an empty surname, and the caller sends an empty string, never
 * null, because both columns are NOT NULL.
 */
export function splitPersonName(full: string): { first: string; last: string } {
  const cleaned = full.trim().replace(/\s+/g, ' ');
  if (!cleaned) return { first: '', last: '' };
  const cut = cleaned.lastIndexOf(' ');
  if (cut === -1) return { first: cleaned, last: '' };
  return { first: cleaned.slice(0, cut), last: cleaned.slice(cut + 1) };
}

const MODES: { value: IntakeMode; label: string; icon: typeof User }[] = [
  { value: 'personal', label: 'Personal', icon: User },
  { value: 'commercial', label: 'Commercial', icon: Building2 },
];

export interface WhoSectionProps {
  value: WhoValue;
  onChange: (patch: Partial<WhoValue>) => void;
  /** The quiet duplicate line. Sits directly under the name box. */
  nameHint?: ReactNode;
  /** True once Save was pressed with no name. */
  nameError?: boolean;
  nameInputRef?: RefObject<HTMLInputElement>;
}

export function WhoSection({
  value,
  onChange,
  nameHint,
  nameError,
  nameInputRef,
}: WhoSectionProps) {
  const isCommercial = value.mode === 'commercial';

  return (
    <section
      aria-labelledby="who-heading"
      className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card sm:p-6"
    >
      <SectionLabel>Who</SectionLabel>
      <h2 id="who-heading" className="mt-1 text-base font-semibold text-cc-text-primary">
        Who is asking
      </h2>

      <div
        role="group"
        aria-label="Personal or commercial"
        className="mt-4 inline-flex rounded-cc-md bg-cc-surface-raised p-0.5"
      >
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const active = value.mode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ mode: mode.value })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-cc-sm px-3.5 py-1.5 text-sm transition-colors duration-fast',
                active
                  ? 'bg-cc-surface-overlay font-medium text-cc-text-primary'
                  : 'text-cc-text-muted hover:text-cc-text-secondary',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <Label htmlFor="who-name" className={INTAKE_LABEL_CLASS}>
          {isCommercial ? 'Business name' : 'Name'}
        </Label>
        <Input
          id="who-name"
          ref={nameInputRef}
          autoComplete="off"
          value={isCommercial ? value.businessName : value.name}
          placeholder={isCommercial ? 'Sorensen and Smith LLC' : 'Milton Smith'}
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? 'who-name-error' : undefined}
          onChange={(event) =>
            onChange(
              isCommercial ? { businessName: event.target.value } : { name: event.target.value },
            )
          }
          className={cn(INTAKE_INPUT_CLASS, 'mt-1.5', nameError && 'border-cc-danger')}
        />
        {nameError && (
          <p id="who-name-error" className="mt-1.5 text-xs text-cc-danger">
            A name is all this page needs, but it does need one.
          </p>
        )}
        {nameHint}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {isCommercial && (
          <div className="sm:col-span-2">
            <Label htmlFor="who-contact" className={INTAKE_LABEL_CLASS}>
              Contact name
            </Label>
            <Input
              id="who-contact"
              autoComplete="off"
              value={value.contactName}
              placeholder="Who you talk to"
              onChange={(event) => onChange({ contactName: event.target.value })}
              className={cn(INTAKE_INPUT_CLASS, 'mt-1.5')}
            />
          </div>
        )}

        <div>
          <Label htmlFor="who-phone" className={INTAKE_LABEL_CLASS}>
            Phone
          </Label>
          <Input
            id="who-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={value.phone}
            placeholder="555-123-4567"
            onChange={(event) => onChange({ phone: event.target.value })}
            onBlur={(event) => onChange({ phone: formatPhoneForDisplay(event.target.value) })}
            className={cn(INTAKE_INPUT_CLASS, 'mt-1.5 cc-num')}
          />
        </div>

        <div>
          <Label htmlFor="who-email" className={INTAKE_LABEL_CLASS}>
            Email
          </Label>
          <Input
            id="who-email"
            type="email"
            autoComplete="off"
            value={value.email}
            placeholder="name@example.com"
            onChange={(event) => onChange({ email: event.target.value })}
            className={cn(INTAKE_INPUT_CLASS, 'mt-1.5')}
          />
        </div>

        <div>
          <Label htmlFor="who-town" className={INTAKE_LABEL_CLASS}>
            Town
          </Label>
          <Input
            id="who-town"
            autoComplete="off"
            value={value.town}
            placeholder="Port Charlotte"
            onChange={(event) => onChange({ town: event.target.value })}
            className={cn(INTAKE_INPUT_CLASS, 'mt-1.5')}
          />
        </div>

        <div>
          <Label htmlFor="who-source" className={INTAKE_LABEL_CLASS}>
            How did they find us
          </Label>
          <Select value={value.source} onValueChange={(next) => onChange({ source: next })}>
            <SelectTrigger id="who-source" className={cn(INTAKE_INPUT_CLASS, 'mt-1.5')}>
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
