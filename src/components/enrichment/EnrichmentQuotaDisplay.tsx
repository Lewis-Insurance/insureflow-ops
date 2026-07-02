// ============================================
// Enrichment Quota Display Component
// Shows quota usage and cost information
// ============================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { EnrichmentQuota, EnrichmentType } from '@/types/intake';
import {
  Zap,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Car,
  Building,
  Home,
  DollarSign,
  Info,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface EnrichmentQuotaDisplayProps {
  quotaStatus: EnrichmentQuota | null;
  monthlySummary?: {
    totalLookups: number;
    totalCostCents: number;
    byType: Record<EnrichmentType, { count: number; costCents: number }>;
  } | null;
  onRefresh?: () => void;
  isLoading?: boolean;
  compact?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const TYPE_ICONS: Record<EnrichmentType, React.ReactNode> = {
  vin: <Car className="h-4 w-4" />,
  property: <Home className="h-4 w-4" />,
  business: <Building className="h-4 w-4" />,
  naics: <Info className="h-4 w-4" />,
  address: <Info className="h-4 w-4" />,
};

const TYPE_LABELS: Record<EnrichmentType, string> = {
  vin: 'VIN Lookup',
  property: 'Property',
  business: 'Business',
  naics: 'NAICS',
  address: 'Address',
};

const TIER_COLORS = {
  basic: 'bg-cc-surface-overlay text-cc-text-secondary',
  standard: 'bg-info/10 text-info',
  premium: 'bg-info/10 text-info',
};

// ============================================
// COMPONENT
// ============================================

export function EnrichmentQuotaDisplay({
  quotaStatus,
  monthlySummary,
  onRefresh,
  isLoading = false,
  compact = false,
}: EnrichmentQuotaDisplayProps) {
  if (!quotaStatus) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <Zap className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-muted-foreground">Loading quota information...</p>
        </CardContent>
      </Card>
    );
  }

  const usagePercent = (quotaStatus.usedThisMonth / quotaStatus.monthlyQuota) * 100;
  const isNearLimit = usagePercent >= 80;
  const isAtLimit = quotaStatus.remainingLookups === 0;

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-3 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Enrichment</span>
        </div>
        <div className="flex-1">
          <Progress value={usagePercent} className="h-2" />
        </div>
        <div className="text-sm text-muted-foreground">
          {quotaStatus.remainingLookups} / {quotaStatus.monthlyQuota}
        </div>
        <Badge className={TIER_COLORS[quotaStatus.tier]}>
          {quotaStatus.tier.charAt(0).toUpperCase() + quotaStatus.tier.slice(1)}
        </Badge>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Enrichment Quota
            </CardTitle>
            <CardDescription>Monthly data enrichment usage</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={TIER_COLORS[quotaStatus.tier]}>
              {quotaStatus.tier.charAt(0).toUpperCase() + quotaStatus.tier.slice(1)}
            </Badge>
            {onRefresh && (
              <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Lookups Used</span>
            <span className={isNearLimit ? 'text-warning' : ''}>
              {quotaStatus.usedThisMonth} / {quotaStatus.monthlyQuota}
            </span>
          </div>
          <Progress
            value={usagePercent}
            className={`h-2 ${isAtLimit ? 'bg-destructive/20' : isNearLimit ? 'bg-warning/20' : ''}`}
          />
          {isAtLimit && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Quota exceeded. Resets on the 1st of next month.
            </div>
          )}
          {!isAtLimit && isNearLimit && (
            <div className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" />
              Approaching quota limit
            </div>
          )}
        </div>

        {/* Monthly Summary */}
        {monthlySummary && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Usage by Type</h4>
            <div className="grid gap-2">
              {(Object.entries(monthlySummary.byType) as [EnrichmentType, { count: number; costCents: number }][])
                .filter(([, data]) => data.count > 0)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([type, data]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between p-2 rounded border bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      {TYPE_ICONS[type]}
                      <span className="text-sm">{TYPE_LABELS[type]}</span>
                      {data.costCents === 0 && (
                        <Badge variant="secondary" className="text-xs">
                          FREE
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {data.count} lookup{data.count !== 1 ? 's' : ''}
                      </span>
                      {data.costCents > 0 && (
                        <span className="text-sm font-medium">
                          ${(data.costCents / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* Total Cost */}
            {monthlySummary.totalCostCents > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="font-medium">Total Cost This Month</span>
                </div>
                <span className="text-lg font-bold text-primary">
                  ${(monthlySummary.totalCostCents / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Free vs Paid Info */}
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <span>VIN lookups are FREE (powered by NHTSA)</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-warning" />
            <span>Property & business lookups cost ${quotaStatus.pricePerLookup.toFixed(2)} each</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// CONFIRMATION DIALOG COMPONENT
// ============================================

interface EnrichmentConfirmDialogProps {
  type: EnrichmentType;
  lookupKey: string;
  costCents: number;
  remainingQuota: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EnrichmentConfirmDialog({
  type,
  lookupKey,
  costCents,
  remainingQuota,
  onConfirm,
  onCancel,
}: EnrichmentConfirmDialogProps) {
  const isFree = costCents === 0;

  if (isFree) {
    // Don't show confirmation for free lookups
    onConfirm();
    return null;
  }

  return (
    <div className="fixed inset-0 bg-[var(--cc-scrim)] flex items-center justify-center z-50">
      <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          {TYPE_ICONS[type]}
          <h3 className="text-lg font-semibold">Confirm {TYPE_LABELS[type]} Lookup</h3>
        </div>

        <div className="space-y-3 mb-6">
          <p className="text-sm text-muted-foreground">
            You are about to perform a {TYPE_LABELS[type].toLowerCase()} lookup for:
          </p>
          <p className="font-mono text-sm bg-muted p-2 rounded">{lookupKey}</p>

          <div className="flex items-center justify-between p-3 rounded border">
            <span className="text-sm">Lookup Cost</span>
            <span className="font-bold">${(costCents / 100).toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Remaining Quota</span>
            <span>{remainingQuota - 1} after this lookup</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            <DollarSign className="mr-2 h-4 w-4" />
            Confirm Lookup
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// VIN DECODER WIDGET
// ============================================

interface VinDecoderWidgetProps {
  onDecode: (vin: string) => Promise<any>;
  isLoading?: boolean;
}

export function VinDecoderWidget({ onDecode, isLoading = false }: VinDecoderWidgetProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-5 w-5" />
          VIN Decoder
          <Badge variant="secondary" className="ml-auto">FREE</Badge>
        </CardTitle>
        <CardDescription>Decode vehicle information from VIN</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter 17-character VIN"
            maxLength={17}
            className="flex-1 px-3 py-2 rounded border bg-muted/50 text-sm font-mono uppercase"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const input = e.currentTarget;
                if (input.value.length === 17) {
                  onDecode(input.value);
                }
              }
            }}
          />
          <Button
            size="sm"
            disabled={isLoading}
            onClick={(e) => {
              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
              if (input?.value.length === 17) {
                onDecode(input.value);
              }
            }}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              'Decode'
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Powered by NHTSA vPIC API - no cost, instant results
        </p>
      </CardContent>
    </Card>
  );
}

export default EnrichmentQuotaDisplay;
