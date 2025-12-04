import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  DollarSign,
  CalendarClock,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import type { KPIData } from "@/hooks/useAOAnalytics";
import type { BadgeVariant } from "@/types/ui";

interface KPICardsProps {
  data: KPIData;
  isLoading?: boolean;
}

export function KPICards({ data, isLoading }: KPICardsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getRenewalRateColor = (rate: number) => {
    if (rate > 80) return "default";
    if (rate > 60) return "secondary";
    return "destructive";
  };

  const getUpcomingUrgencyVariant = (count: number) => {
    if (count > 50) return "destructive";
    if (count > 20) return "secondary";
    return "default";
  };

  const cards = [
    {
      title: "Total Renewals",
      value: data.totalRenewals,
      subtitle: "Total policies in pipeline",
      icon: FileText,
      formatter: (v: number) => v.toLocaleString(),
    },
    {
      title: "Total Premium at Stake",
      value: data.totalPremium,
      subtitle: "Total annual premium value",
      icon: DollarSign,
      formatter: formatCurrency,
    },
    {
      title: "Upcoming (Next 30 Days)",
      value: data.upcoming30Days,
      subtitle: "Require immediate attention",
      icon: CalendarClock,
      formatter: (v: number) => v.toLocaleString(),
      badge: getUpcomingUrgencyVariant(data.upcoming30Days),
    },
    {
      title: "Average Premium",
      value: data.avgPremium,
      subtitle: "Per policy average",
      icon: TrendingUp,
      formatter: formatCurrency,
    },
    {
      title: "Renewal Rate",
      value: data.renewalRate,
      subtitle: "Success rate",
      icon: CheckCircle,
      formatter: formatPercentage,
      badgeVariant: getRenewalRateColor(data.renewalRate),
    },
    {
      title: "At-Risk Renewals",
      value: data.atRisk,
      subtitle: "Need immediate action",
      icon: AlertTriangle,
      formatter: (v: number) => v.toLocaleString(),
      alert: data.atRisk > 0,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, index) => (
        <Card key={index}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <card.icon className="h-4 w-4" />
                {card.title}
              </span>
              {card.badge && (
                <Badge variant={card.badge as BadgeVariant}>{card.formatter(card.value)}</Badge>
              )}
              {card.alert && card.value > 0 && (
                <Badge variant="destructive">{card.value}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.formatter(card.value)}</div>
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
