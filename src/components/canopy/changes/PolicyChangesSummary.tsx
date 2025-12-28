// ============================================================================
// POLICY CHANGES SUMMARY
// ============================================================================
// Comprehensive view of all policy changes between snapshots.
// Shows changes grouped by category with before/after values.
// ============================================================================

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Car,
  User,
  Shield,
  DollarSign,
  Home,
  FileText,
  Calendar,
  Check,
  X,
  Loader2,
  History,
} from 'lucide-react';
import {
  usePolicyChanges,
  usePolicySnapshots,
  useCompareSnapshots,
  type PolicyChange,
} from '@/hooks/useCanopyChangeDetection';
import { format, formatDistanceToNow } from 'date-fns';

interface PolicyChangesSummaryProps {
  pullId: string;
  showHeader?: boolean;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bgColor: string }
> = {
  vehicle: {
    label: 'Vehicle Changes',
    icon: Car,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  driver: {
    label: 'Driver Changes',
    icon: User,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  coverage: {
    label: 'Coverage Changes',
    icon: Shield,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  premium: {
    label: 'Premium Changes',
    icon: DollarSign,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  dwelling: {
    label: 'Property Changes',
    icon: Home,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
  },
  policy: {
    label: 'Policy Changes',
    icon: FileText,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  },
  claim: {
    label: 'Claims',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
};

export function PolicyChangesSummary({ pullId, showHeader = true }: PolicyChangesSummaryProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { changes, summary, previousDate, currentDate, hasChanges, isLoading } =
    usePolicyChanges(pullId);
  const { data: snapshots } = usePolicySnapshots(pullId);

  // Group changes by category
  const groupedChanges = changes.reduce((acc, change) => {
    if (!acc[change.category]) {
      acc[change.category] = [];
    }
    acc[change.category].push(change);
    return acc;
  }, {} as Record<string, PolicyChange[]>);

  const categories = Object.keys(groupedChanges);
  const filteredChanges =
    selectedCategory === 'all'
      ? changes
      : groupedChanges[selectedCategory] || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!hasChanges) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <p className="font-medium">No Changes Detected</p>
          <p className="text-sm text-muted-foreground mt-1">
            {snapshots && snapshots.length > 0
              ? 'Policy data matches the previous snapshot'
              : 'No snapshots available for comparison'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-5 h-5" />
                Policy Changes
              </CardTitle>
              <CardDescription>
                {previousDate && currentDate ? (
                  <>
                    Comparing {format(new Date(previousDate), 'MMM d, yyyy')} to{' '}
                    {format(new Date(currentDate), 'MMM d, yyyy')}
                  </>
                ) : (
                  'Changes since last snapshot'
                )}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-sm">
              {summary?.totalChanges || 0} changes
            </Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {summary.coverageChanges > 0 && (
              <StatBadge
                icon={Shield}
                label="Coverage"
                count={summary.coverageChanges}
                color="green"
              />
            )}
            {summary.premiumChanges > 0 && (
              <StatBadge
                icon={DollarSign}
                label="Premium"
                count={summary.premiumChanges}
                color="amber"
              />
            )}
            {summary.vehicleChanges > 0 && (
              <StatBadge
                icon={Car}
                label="Vehicle"
                count={summary.vehicleChanges}
                color="blue"
              />
            )}
            {summary.driverChanges > 0 && (
              <StatBadge
                icon={User}
                label="Driver"
                count={summary.driverChanges}
                color="purple"
              />
            )}
          </div>
        )}

        <Separator />

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => {
                const config = CATEGORY_CONFIG[cat];
                return (
                  <SelectItem key={cat} value={cat}>
                    {config?.label || cat} ({groupedChanges[cat].length})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Changes List */}
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {selectedCategory === 'all'
              ? categories.map((category) => (
                  <CategorySection
                    key={category}
                    category={category}
                    changes={groupedChanges[category]}
                  />
                ))
              : filteredChanges.length > 0 && (
                  <div className="space-y-2">
                    {filteredChanges.map((change, idx) => (
                      <ChangeItem key={idx} change={change} />
                    ))}
                  </div>
                )}
          </div>
        </ScrollArea>

        {/* Snapshot History */}
        {snapshots && snapshots.length > 2 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <History className="w-4 h-4" />
                Snapshot History
              </p>
              <div className="flex flex-wrap gap-2">
                {snapshots.slice(0, 5).map((snapshot) => (
                  <Badge key={snapshot.id} variant="outline" className="text-xs">
                    {format(new Date(snapshot.created_at), 'MMM d, yyyy')}
                    <span className="ml-1 text-muted-foreground">
                      ({snapshot.snapshot_type})
                    </span>
                  </Badge>
                ))}
                {snapshots.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{snapshots.length - 5} more
                  </Badge>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Sub-component for category section
function CategorySection({
  category,
  changes,
}: {
  category: string;
  changes: PolicyChange[];
}) {
  const config = CATEGORY_CONFIG[category] || {
    label: category,
    icon: AlertCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  };
  const Icon = config.icon;

  return (
    <div className={`rounded-lg p-3 ${config.bgColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className={`font-medium text-sm ${config.color}`}>{config.label}</span>
        <Badge variant="secondary" className="text-xs ml-auto">
          {changes.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {changes.map((change, idx) => (
          <ChangeItem key={idx} change={change} compact />
        ))}
      </div>
    </div>
  );
}

// Sub-component for individual change item
function ChangeItem({ change, compact = false }: { change: PolicyChange; compact?: boolean }) {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
      // Format as currency if it looks like a dollar amount
      if (change.field.includes('premium') || change.field.includes('deductible')) {
        return `$${value.toLocaleString()}`;
      }
      return value.toLocaleString();
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return `${value.length} items`;
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  const getChangeIcon = () => {
    switch (change.changeType) {
      case 'added':
        return <TrendingUp className="w-3 h-3 text-green-500" />;
      case 'removed':
        return <TrendingDown className="w-3 h-3 text-red-500" />;
      case 'modified':
        return <ArrowRight className="w-3 h-3 text-amber-500" />;
      default:
        return null;
    }
  };

  const getChangeTypeBadge = () => {
    switch (change.changeType) {
      case 'added':
        return (
          <Badge className="bg-green-100 text-green-700 text-xs">Added</Badge>
        );
      case 'removed':
        return (
          <Badge className="bg-red-100 text-red-700 text-xs">Removed</Badge>
        );
      case 'modified':
        return (
          <Badge className="bg-amber-100 text-amber-700 text-xs">Changed</Badge>
        );
      default:
        return null;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between bg-white rounded px-2 py-1.5 text-sm">
        <div className="flex items-center gap-2">
          {getChangeIcon()}
          <span className="font-medium">{change.fieldLabel}</span>
        </div>
        <div className="text-muted-foreground text-xs">
          {change.changeType === 'modified' ? (
            <span>
              <span className="line-through">{formatValue(change.previousValue)}</span>
              {' → '}
              <span className="font-medium text-foreground">
                {formatValue(change.currentValue)}
              </span>
            </span>
          ) : change.changeType === 'added' ? (
            <span className="text-green-600">{formatValue(change.currentValue)}</span>
          ) : (
            <span className="text-red-600 line-through">
              {formatValue(change.previousValue)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between p-3 bg-muted/50 rounded-lg">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {getChangeIcon()}
          <span className="font-medium text-sm">{change.fieldLabel}</span>
          {getChangeTypeBadge()}
        </div>
        <p className="text-xs text-muted-foreground">
          Field: <code className="bg-muted px-1 rounded">{change.field}</code>
        </p>
      </div>
      <div className="text-right text-sm">
        {change.changeType === 'modified' ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-muted-foreground line-through">
                {formatValue(change.previousValue)}
              </span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="font-medium">{formatValue(change.currentValue)}</span>
            </div>
          </div>
        ) : change.changeType === 'added' ? (
          <div className="flex items-center gap-1 text-green-600">
            <TrendingUp className="w-3 h-3" />
            {formatValue(change.currentValue)}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-red-600">
            <TrendingDown className="w-3 h-3" />
            <span className="line-through">{formatValue(change.previousValue)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component for stat badges
function StatBadge({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: 'green' | 'amber' | 'blue' | 'purple' | 'red';
}) {
  const colorClasses = {
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${colorClasses[color]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{label}</span>
      <Badge variant="secondary" className="text-xs h-4 px-1.5">
        {count}
      </Badge>
    </div>
  );
}

export default PolicyChangesSummary;
