import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAORenewalAnalytics } from "@/hooks/useAORenewalAnalytics";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  Percent,
  ArrowRightLeft,
  Building2,
  Clock,
  DollarSign,
} from "lucide-react";

export default function AORenewalAnalyticsPage() {
  const navigate = useNavigate();
  const { data: analytics, isLoading, error } = useAORenewalAnalytics();

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
      <AppLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                Unable to load analytics. Please try again.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/ao-renewals")}
                className="mt-4"
              >
                Back to Renewals
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const data = analytics!;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate("/ao-renewals")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">Renewal Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Track premium retained vs lost across your Auto-Owners renewals
              </p>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Premium Lost */}
          <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-600">
                <TrendingDown className="h-4 w-4" />
                Premium Lost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {formatCurrency(data.premiumLost)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.policiesLost} policies ({data.lostCount} lost, {data.cancelledCount} cancelled)
              </p>
            </CardContent>
          </Card>

          {/* Premium Retained */}
          <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-600">
                <TrendingUp className="h-4 w-4" />
                Premium Retained
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {formatCurrency(data.premiumRetained)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.policiesRetained} policies moved to partner carriers
              </p>
            </CardContent>
          </Card>

          {/* Retention Rate */}
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-600">
                <Percent className="h-4 w-4" />
                Retention Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {data.retentionRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Premium retained of total closed
              </p>
            </CardContent>
          </Card>

          {/* At-Risk Premium */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                At-Risk Premium
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatCurrency(data.atRiskPremium)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.atRiskCount} renewals pending/in-progress
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Breakdown Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Carrier Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Premium by Carrier
              </CardTitle>
              <CardDescription>
                Breakdown of policies moved to partner carriers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.byCarrier.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No policies have been moved yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Carrier</TableHead>
                      <TableHead className="text-center">Policies</TableHead>
                      <TableHead className="text-right">Premium</TableHead>
                      <TableHead className="text-right">Avg</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byCarrier.map((carrier) => (
                      <TableRow key={carrier.carrier}>
                        <TableCell className="font-medium">
                          {carrier.carrier}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{carrier.count}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatCurrency(carrier.premium)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency(carrier.avgPremium)}
                        </TableCell>
                        <TableCell className="text-right">
                          {carrier.percentOfMoved.toFixed(0)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* By Term Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Premium by Policy Term
              </CardTitle>
              <CardDescription>
                6-month vs annual policy breakdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.byTerm.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No term data available</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Term</TableHead>
                      <TableHead className="text-center">Policies</TableHead>
                      <TableHead className="text-right">Premium</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byTerm.map((term) => (
                      <TableRow key={term.term}>
                        <TableCell className="font-medium">
                          {term.term === "6_month" ? "6 Months" : "Annual"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{term.count}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatCurrency(term.premium)}
                        </TableCell>
                        <TableCell className="text-right">
                          {term.percentOfMoved.toFixed(0)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Premium by Status
            </CardTitle>
            <CardDescription>
              Complete breakdown of renewal outcomes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-sm text-muted-foreground">Renewed</div>
                <div className="text-xl font-bold text-green-600">
                  {data.renewedCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(data.renewedPremium)}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <div className="text-sm text-muted-foreground">Moved</div>
                <div className="text-xl font-bold text-blue-600">
                  {data.movedCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(data.movedPremium)}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30">
                <div className="text-sm text-muted-foreground">Lost</div>
                <div className="text-xl font-bold text-red-600">
                  {data.lostCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(data.lostPremium)}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30">
                <div className="text-sm text-muted-foreground">Cancelled</div>
                <div className="text-xl font-bold text-red-600">
                  {data.cancelledCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(data.cancelledPremium)}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
                <div className="text-sm text-muted-foreground">At Risk</div>
                <div className="text-xl font-bold text-yellow-600">
                  {data.atRiskCount}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(data.atRiskPremium)}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                <div className="text-sm text-muted-foreground">This Month</div>
                <div className="text-xl font-bold text-purple-600">
                  {data.movedThisMonth}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(data.movedThisMonthPremium)} moved
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
