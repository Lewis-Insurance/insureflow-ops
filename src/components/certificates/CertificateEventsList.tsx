// Certificate activity timeline (04-issuance-and-snapshots.md Section 9.1).
//
// Renders certificate_events newest first: action label, actor, relative time,
// and the salient metadatum per action (`to` for emailed, `reason` for voided,
// successor number for reissued, restored document for document_restored).
//
// Props are exactly { certificateId } per the spec; the timeline reads
// certificate_events directly under the staff SELECT RLS. certificate_events is
// not in the generated Supabase types (drift), so the table name is cast the
// same way useAutoDrivers.ts does.
//
// Calm Command: cc-* tokens only, both themes, tabular figures on the timestamp,
// no lime, no em/en dashes. Content-shaped skeleton while loading (not a spinner).

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/cc';
import type { CertificateEvent, CertificateEventAction } from '@/types/certificates';

interface CertificateEventsListProps {
  certificateId: string;
}

const ACTION_LABEL: Record<CertificateEventAction, string> = {
  generated: 'Generated',
  previewed: 'Viewed',
  downloaded: 'Downloaded',
  emailed: 'Emailed',
  reissued: 'Reissued',
  voided: 'Voided',
  document_restored: 'Restored to Documents',
};

/** Pull the one metadatum worth showing next to each action, if present. */
function salientDetail(event: CertificateEvent): string | null {
  const m = event.metadata ?? {};
  switch (event.action) {
    case 'emailed': {
      const to = typeof m.to === 'string' ? m.to : null;
      const cc = Array.isArray(m.cc)
        ? (m.cc as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      if (to && cc.length > 0) return `To ${to}, cc ${cc.join(', ')}`;
      if (to) return `To ${to}`;
      return null;
    }
    case 'voided':
      return typeof m.reason === 'string' ? m.reason : null;
    case 'reissued':
      return typeof m.new_certificate_number === 'string'
        ? `Replaced by ${m.new_certificate_number}`
        : null;
    case 'generated':
      return typeof m.certificate_number === 'string' ? (m.certificate_number as string) : null;
    case 'document_restored':
      return typeof m.document_id === 'string' ? 'New Documents pointer created' : null;
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDistanceToNow(d)} ago`;
}

export function CertificateEventsList({ certificateId }: CertificateEventsListProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['certificate-events', certificateId],
    queryFn: async (): Promise<CertificateEvent[]> => {
      // certificate_events is not in the generated types (drift); the `as any`
      // table cast mirrors useAutoDrivers.ts. RLS still applies to the caller.
      const { data: rows, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('certificate_events' as any)
        .select('*')
        .eq('certificate_id', certificateId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (rows || []) as unknown as CertificateEvent[];
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-1" aria-hidden="true">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  const events = data ?? [];

  if (events.length === 0) {
    return <p className="py-2 text-sm text-cc-text-muted">No activity recorded yet.</p>;
  }

  return (
    <ol className="space-y-3 py-1">
      {events.map((event) => {
        const detail = salientDetail(event);
        return (
          <li key={event.id} className="flex gap-3">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-cc-border-strong"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-cc-text-primary">
                  {ACTION_LABEL[event.action]}
                </span>
                <span className="[font-variant-numeric:tabular-nums] text-xs text-cc-text-muted">
                  {relativeTime(event.created_at)}
                </span>
              </div>
              {detail && (
                <p className="mt-0.5 break-words text-sm text-cc-text-secondary">{detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
