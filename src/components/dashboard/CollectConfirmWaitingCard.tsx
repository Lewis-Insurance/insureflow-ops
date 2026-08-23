import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionLabel, StatusPill } from '@/components/cc';
import { useMyCollectConfirmWaiting } from '@/hooks/useMyCollectConfirmWaiting';

const FILENAME_MAX = 40;

export function truncateFilename(name: string, max: number = FILENAME_MAX): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

interface CollectConfirmWaitingCardProps {
  /** Reports whether the card is showing rows so the page can keep one lime primary. */
  onHasRows?: (hasRows: boolean) => void;
}

/**
 * "Portal came back": extracted portal uploads with pending write-back proposals for the
 * signed-in producer. Renders nothing when empty (no filler). The newest row carries the
 * card's single lime primary; the page demotes its header button while rows exist.
 */
export function CollectConfirmWaitingCard({ onHasRows }: CollectConfirmWaitingCardProps) {
  const navigate = useNavigate();
  const { rows, limit, loading, error, refetch } = useMyCollectConfirmWaiting();
  const hasRows = rows.length > 0;

  useEffect(() => {
    onHasRows?.(hasRows);
  }, [hasRows, onHasRows]);

  if (loading) return null;

  if (error) {
    return (
      <section
        aria-label="Portal came back"
        className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card"
      >
        <SectionLabel>Portal came back</SectionLabel>
        <p className="mt-3 text-sm text-cc-text-muted">
          Could not load portal uploads.{' '}
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-medium text-cc-text-secondary underline-offset-2 transition-colors hover:text-cc-text-primary hover:underline"
          >
            Retry
          </button>
        </p>
      </section>
    );
  }

  if (!hasRows) return null;

  const open = (analysisId: string) => navigate(`/analyze-documents/${analysisId}`);

  return (
    <section
      aria-label="Portal came back"
      className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card"
    >
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel>Portal came back</SectionLabel>
        {rows.length >= limit && (
          <button
            type="button"
            onClick={() => navigate('/analyze-documents')}
            className="inline-flex items-center gap-1 text-sm text-cc-text-secondary transition-colors hover:text-cc-text-primary"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <ul className="divide-y divide-cc-border-subtle">
        {rows.map((row, index) => {
          const isNewest = index === 0;
          return (
            <li
              key={row.upload_id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-cc-text-primary">
                    {row.account_name}
                  </span>
                  <StatusPill override={{ label: 'Confirm waiting', tone: 'neutral' }} />
                </div>
                <p className="cc-num mt-0.5 truncate text-xs text-cc-text-muted">
                  {truncateFilename(row.filename)} · {format(new Date(row.uploaded_at), 'MMM d, h:mm a')}
                </p>
                {row.pending_count > 1 && (
                  <p className="cc-num mt-0.5 text-xs text-cc-text-secondary">
                    {row.pending_count} carriers to review
                  </p>
                )}
              </div>
              {isNewest ? (
                <Button
                  data-primary
                  onClick={() => open(row.analysis_id)}
                  className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
                >
                  Confirm write-back
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="outline" onClick={() => open(row.analysis_id)} className="rounded-cc-md">
                  Open
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
