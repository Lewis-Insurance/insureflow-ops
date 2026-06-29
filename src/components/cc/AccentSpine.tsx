import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * AccentSpine is the single site-wide subtle-accent pattern for active / primary
 * / selected / pinned / next-action surfaces (component-rules.md "Cards and
 * nested tiles", constitution rule 3: one lime accent, color is never the only
 * signal). Active surfaces get a raised fill and a quiet 2px lime LEFT BORDER
 * (a border, never a fill, so the one-lime-fill rule holds). Inactive surfaces
 * are flat with no spine. Tokens only, no hardcoded hex.
 *
 * It is a plain div wrapper: consumers spread their own role/tabIndex/onClick/
 * onKeyDown/aria-* and pass a `className` for padding, cursor, hover, and focus.
 * The consumer className is merged LAST so it never gets overridden.
 */
interface AccentSpineProps extends React.ComponentPropsWithoutRef<'div'> {
  /** Active = live / primary / selected / pinned / next-action: raised surface + lime spine. */
  active?: boolean;
}

export const AccentSpine = forwardRef<HTMLDivElement, AccentSpineProps>(
  ({ active = false, className, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        data-accent={active ? '' : undefined}
        className={cn(
          'rounded-cc-lg border transition-colors duration-fast',
          active
            ? 'border-cc-border-subtle border-l-2 border-l-cc-accent bg-cc-surface-raised shadow-card'
            : 'border-cc-border-subtle bg-cc-surface',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

AccentSpine.displayName = 'AccentSpine';
