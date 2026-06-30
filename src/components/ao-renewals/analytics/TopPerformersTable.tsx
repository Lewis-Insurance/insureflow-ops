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
import { Trophy } from "lucide-react";
import { differenceInDays } from "date-fns";
import type { AORenewal } from "@/hooks/useAORenewals";
import { useNavigate } from "react-router-dom";

interface TopPerformersTableProps {
  data: AORenewal[];
  isLoading?: boolean;
  limit?: number;
}

export function TopPerformersTable({ data, isLoading, limit = 20 }: TopPerformersTableProps) {
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
    const colors: Record<string, string> = {
      pending: "bg-info text-info-foreground",
      contacted: "bg-warning text-warning-foreground",
      quoted: "bg-cc-accent text-cc-on-accent",
      renewed: "bg-success text-success-foreground",
      lost: "bg-destructive text-destructive-foreground",
      cancelled: "bg-muted-foreground text-background",
    };

    return (
      <Badge variant="secondary" className={colors[status] || ""}>
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
    if (days <= 30) {
      return <Badge variant="secondary">{days}d</Badge>;
    }
    return <Badge variant="outline">{days}d</Badge>;
  };

  const topRenewals = [...data]
    .sort((a, b) => (b.current_premium || 0) - (a.current_premium || 0))
    .slice(0, limit);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" />
            Top Performers
          </CardTitle>
          <CardDescription>Highest value renewal opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No renewal data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPremium = topRenewals.reduce((sum, r) => sum + (r.current_premium || 0), 0);
  const avgPremium = totalPremium / topRenewals.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-warning" />
          Top {limit} Highest Value Renewals
        </CardTitle>
        <CardDescription>
          {topRenewals.length} renewals representing {formatCurrency(totalPremium)} in premium (avg:{" "}
          {formatCurrency(avgPremium)})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Premium</TableHead>
                <TableHead>Renewal Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topRenewals.map((renewal, index) => {
                const { date, daysUntil } = formatDate(renewal.renewal_date);
                return (
                  <TableRow
                    key={renewal.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/ao-renewals/${renewal.id}/edit`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                        {index === 1 && <Trophy className="h-4 w-4 text-gray-400" />}
                        {index === 2 && <Trophy className="h-4 w-4 text-orange-600" />}
                        <span className="font-medium">#{index + 1}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{renewal.customer_name}</TableCell>
                    <TableCell className="font-mono text-sm">{renewal.policy_number}</TableCell>
                    <TableCell className="text-sm">{renewal.policy_type}</TableCell>
                    <TableCell className="font-bold text-success">
                      {formatCurrency(renewal.current_premium)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-sm">{date}</span>
                        {getDaysUntilBadge(daysUntil)}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(renewal.status)}</TableCell>
                    <TableCell>{getPriorityBadge(renewal.priority)}</TableCell>
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
