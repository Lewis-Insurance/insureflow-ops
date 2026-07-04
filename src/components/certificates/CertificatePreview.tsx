// CertificatePreview (blueprint D Section 4, doc 06 Section 4.10) - the right column.
//
// The flattened client-fill preview in an <iframe> blob URL at letter aspect
// ratio. Building = a thin accent bar across the top (never a spinner), the last
// preview stays visible underneath. Empty / no-lines / no-template states are
// content-shaped, one sentence, at most one button. aria-live="polite" announces
// updates. A ghost "Open in a new tab" covers browsers with degraded iframe PDF
// rendering, and doubles as the fallback when the iframe errors.
//
// Calm Command: cc-* tokens both themes, no em or en dashes.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CertificatePreviewProps {
  blobUrl: string | null;
  building: boolean;
  error: string | null;
  /** True once at least one coverage line is selected. */
  hasLines: boolean;
  /** True when the current ACORD 25 template is onboarded. */
  hasTemplate: boolean;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[8.5/11] max-h-[80vh] w-full overflow-hidden rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised">
      {children}
    </div>
  );
}

function CenteredTile({
  icon: Icon,
  children,
}: {
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-cc-md bg-cc-surface-overlay text-cc-text-secondary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {children}
    </div>
  );
}

export function CertificatePreview({
  blobUrl,
  building,
  error,
  hasLines,
  hasTemplate,
}: CertificatePreviewProps) {
  const [iframeFailed, setIframeFailed] = useState(false);

  // No template onboarded: the terminal empty state with the onboarding link.
  if (!hasTemplate) {
    return (
      <Frame>
        <CenteredTile icon={FileText}>
          <p className="text-sm text-cc-text-secondary">
            No ACORD 25 template is onboarded yet. Upload the blank form in ACORD Templates.
          </p>
          <Link
            to="/acord-templates"
            className="inline-flex items-center rounded-cc-md border border-cc-border-interactive bg-cc-surface px-3 py-1.5 text-sm text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            Open ACORD Templates
          </Link>
        </CenteredTile>
      </Frame>
    );
  }

  // No coverage line selected: nothing to preview yet.
  if (!hasLines) {
    return (
      <Frame>
        <CenteredTile icon={FileText}>
          <p className="text-sm text-cc-text-secondary">
            Select at least one coverage line to preview the certificate.
          </p>
        </CenteredTile>
      </Frame>
    );
  }

  return (
    <div className="space-y-2" aria-live="polite">
      <Frame>
        {/* Building progress bar: thin accent line across the top, not a spinner. */}
        {building && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-cc-surface-overlay">
            <div className="h-full w-full animate-pulse bg-cc-accent" />
          </div>
        )}

        {error ? (
          <CenteredTile icon={FileText}>
            <p className="text-sm text-cc-text-secondary">{error}</p>
          </CenteredTile>
        ) : blobUrl && !iframeFailed ? (
          <iframe
            title="Certificate preview"
            src={`${blobUrl}#toolbar=0&navpanes=0`}
            onError={() => setIframeFailed(true)}
            className="h-full w-full bg-cc-surface-raised"
          />
        ) : blobUrl && iframeFailed ? (
          <CenteredTile icon={FileText}>
            <p className="text-sm text-cc-text-secondary">
              Inline preview is not available in this browser.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-cc-text-secondary hover:text-cc-text-primary"
              onClick={() => window.open(blobUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open preview in a new tab
            </Button>
          </CenteredTile>
        ) : (
          <CenteredTile icon={FileText}>
            <p className="text-sm text-cc-text-muted">Building the preview.</p>
          </CenteredTile>
        )}
      </Frame>

      {blobUrl && !error && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-cc-text-muted hover:text-cc-text-primary"
            onClick={() => window.open(blobUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open preview in a new tab
          </Button>
        </div>
      )}
    </div>
  );
}
