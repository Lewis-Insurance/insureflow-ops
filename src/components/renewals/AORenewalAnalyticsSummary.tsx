import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAORenewalKPIs } from "@/hooks/useAORenewalAnalytics";
import { TrendingDown, TrendingUp, Percent, ArrowRightLeft } from "lucide-react";

export function AORenewalAnalyticsSummary() {
  const { data: kpis, isLoading, error } = useAORenewalKPIs();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !kpis) {
    return null;
  }

  // Only show analytics if there's data
  const hasData = kpis.premiumLost > 0 || kpis.premiumRetained > 0;
  if (!hasData) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Premium Lost */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-600">
            <TrendingDown className="h-4 w-4" />
            Premium Lost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(kpis.premiumLost)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.policiesLost} {kpis.policiesLost === 1 ? "policy" : "policies"} lost/cancelled
          </p>
        </CardContent>
      </Card>

      {/* Premium Retained (Moved) */}
      <Card className="border-green-200 dark:border-green-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-600">
            <TrendingUp className="h-4 w-4" />
            Premium Retained
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(kpis.premiumRetained)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.policiesRetained} {kpis.policiesRetained === 1 ? "policy" : "policies"} moved
          </p>
        </CardContent>
      </Card>

      {/* Retention Rate */}
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-600">
            <Percent className="h-4 w-4" />
            Retention Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {kpis.retentionRate.toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Of closed renewals retained
          </p>
        </CardContent>
      </Card>

      {/* Policies Moved */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Moved This Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {kpis.policiesRetained}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Policies moved to other carriers
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
