/**
 * Shared utilities and components for Property Policy Details
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FileSearch } from 'lucide-react';
import type { BoundingBox } from '@/hooks/usePropertyExtraction';

// =============================================================================
// FORMATTERS
// =============================================================================

export const formatCurrency = (amount: number | undefined | null): string => {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (date: string | undefined | null): string => {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return date;
  }
};

// =============================================================================
// LABEL MAPS
// =============================================================================

export const FORM_TYPE_LABELS: Record<string, string> = {
  special: 'Special Form (CP 10 30)',
  broad: 'Broad Form (CP 10 20)',
  basic: 'Basic Form (CP 10 10)',
};

export const VALUATION_LABELS: Record<string, string> = {
  replacement_cost: 'Replacement Cost (RCV)',
  actual_cash_value: 'Actual Cash Value (ACV)',
  functional_replacement: 'Functional Replacement (FRV)',
  stated_amount: 'Stated Amount',
  agreed_value: 'Agreed Value',
};

// =============================================================================
// EVIDENCE INDICATOR
// =============================================================================

export interface PropertyEvidenceCatalog {
  entries: Record<string, { confidence: number; boundingBox?: BoundingBox }>;
  stats: { totalEntries: number };
}

interface EvidenceIndicatorProps {
  fieldName: string;
  evidenceCatalog?: PropertyEvidenceCatalog | null;
  fieldEvidence?: Record<string, string[]>;
  onEvidenceClick?: (evidenceIds: string[], boundingBoxes: Record<string, BoundingBox>) => void;
}

export function EvidenceIndicator({
  fieldName,
  evidenceCatalog,
  fieldEvidence,
  onEvidenceClick,
}: EvidenceIndicatorProps) {
  if (!evidenceCatalog || !fieldEvidence || !onEvidenceClick) {
    return null;
  }

  const evidenceIds = fieldEvidence[fieldName] || [];
  if (evidenceIds.length === 0) {
    return null;
  }

  const boundingBoxes: Record<string, BoundingBox> = {};
  for (const id of evidenceIds) {
    const entry = evidenceCatalog.entries[id];
    if (entry?.boundingBox) {
      boundingBoxes[id] = entry.boundingBox;
    }
  }

  const firstEntry = evidenceCatalog.entries[evidenceIds[0]];
  const confidence = firstEntry?.confidence || 0;

  const handleClick = () => {
    onEvidenceClick(evidenceIds, boundingBoxes);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={`inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
              confidence >= 0.95
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : confidence >= 0.8
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : confidence >= 0.7
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            <FileSearch className="h-3 w-3" />
            {evidenceIds.length > 1 && <span>{evidenceIds.length}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-medium">Click to view source</p>
            <p className="text-muted-foreground">
              {evidenceIds.length} evidence {evidenceIds.length === 1 ? 'entry' : 'entries'} •{' '}
              {Math.round(confidence * 100)}% confidence
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// =============================================================================
// INFO FIELD
// =============================================================================

interface InfoFieldProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  mono?: boolean;
}

export function InfoField({ label, value, icon: Icon, mono = false }: InfoFieldProps) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      <div className={`mt-1 ${mono ? 'font-mono' : ''}`}>{value || 'N/A'}</div>
    </div>
  );
}

// =============================================================================
// ADDRESS DISPLAY
// =============================================================================

interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export function AddressDisplay({ address }: { address: Address | undefined }) {
  if (!address?.street) return <span className="text-muted-foreground">Not provided</span>;
  return (
    <div className="text-sm">
      <p>{address.street}</p>
      <p>
        {address.city}, {address.state} {address.zip}
      </p>
    </div>
  );
}

// =============================================================================
// EXTRACTION STATUS BADGE
// =============================================================================

export function ExtractionStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null;

  const variants: Record<
    string,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
  > = {
    AUTO_APPLIED: { variant: 'default', label: 'Auto' },
    NEEDS_REVIEW: { variant: 'secondary', label: 'Review' },
    LOW_CONFIDENCE: { variant: 'outline', label: 'Low' },
    NOT_FOUND: { variant: 'outline', label: 'N/F' },
    MANUAL: { variant: 'secondary', label: 'Manual' },
  };

  const config = variants[status] || { variant: 'outline' as const, label: status };

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}
