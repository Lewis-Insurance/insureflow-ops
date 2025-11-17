import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { differenceInDays } from "date-fns";
import { calculateRiskScore } from "@/hooks/useAOAnalytics";
import type { AORenewal } from "@/hooks/useAORenewals";
import { useNavigate } from "react-router-dom";

interface AtRiskRenewalsTableProps {
  data: AORenewal[];
  isLoading?: boolean;
}

export function AtRiskRenewalsTable({ data, isLoading }: AtRiskRenewalsTableProps) {
  const navigate = useNavigate();

  const formatCurrency = (value: number | null) => {
    if (!value) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const daysUntil = differenceInDays(d, today);

    return {
      date: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      daysUntil,
    };
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, any> = {
      urgent: "destructive",
      high: "default",
      normal: "secondary",
      low: "outline",
    };
    return <Badge variant={variants[priority] || "outline"}>{priority.toUpperCase()}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: "secondary",
      contacted: "default",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getDaysUntilBadge = (days: number) => {
    if (days < 0) {
      return <Badge variant="destructive">Overdue {Math.abs(days)}d</Badge>;
    }
    if (days <= 7) {
      return <Badge variant="destructive">{days}d</Badge>;
    }
    if (days <= 14) {
      return <Badge variant="secondary">{days}d</Badge>;
    }
    return <Badge variant="outline">{days}d</Badge>;
  };

  const sortedData = [...data]
    .map((renewal) => ({
      ...renewal,
      riskScore: calculateRiskScore(renewal),
    }))
    .sort((a, b) => b.riskScore - a.riskScore);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>At-Risk Renewals</CardTitle>
          <CardDescription>High-priority renewals requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No at-risk renewals found
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>At-Risk Renewals</CardTitle>
        <CardDescription>
          {data.length} high-priority renewal{data.length !== 1 ? "s" : ""} requiring attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Risk</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Renewal Date</TableHead>
                <TableHead>Premium</TableHead>
                <TableHead>3Y Losses</TableHead>
                <TableHead>Oldest Age</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((renewal) => {
                const { date, daysUntil } = formatDate(renewal.renewal_date);
                return (
                  <TableRow
                    key={renewal.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/ao-renewals/${renewal.id}/edit`)}
                  >
                    <TableCell>
                      <Badge variant={renewal.riskScore > 50 ? "destructive" : "secondary"}>
                        {renewal.riskScore}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{renewal.customer_name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {renewal.policy_number}
                    </TableCell>
                    <TableCell className="text-sm">{renewal.policy_type}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm">{date}</span>
                        {getDaysUntilBadge(daysUntil)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(renewal.current_premium)}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {renewal.losses_3yr ?? '-'}
                    </TableCell>
                    <TableCell className="text-sm text-center">
                      {renewal.oldest_in_household ?? '-'}
                    </TableCell>
                    <TableCell>{getPriorityBadge(renewal.priority)}</TableCell>
                    <TableCell>{getStatusBadge(renewal.status)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
