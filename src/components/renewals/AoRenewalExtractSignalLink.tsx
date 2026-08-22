import { useNavigate } from 'react-router-dom';
import type { AoRenewalExtractSignal } from '@/lib/aoRenewalExtractSignal';

interface AoRenewalExtractSignalLinkProps {
  signal: AoRenewalExtractSignal | null | undefined;
}

/**
 * Compact lime tap on AO renewal rows when a this-term extract exists.
 * Opens the canonical Analyze Documents reload route for that analysis id.
 */
export function AoRenewalExtractSignalLink({ signal }: AoRenewalExtractSignalLinkProps) {
  const navigate = useNavigate();

  if (!signal) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        navigate(`/analyze-documents/${signal.analysisId}`);
      }}
      className="mt-1 text-xs font-semibold text-cc-accent transition-colors hover:text-cc-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-accent/40 rounded-cc-sm"
    >
      {signal.label}
    </button>
  );
}
