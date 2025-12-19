import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyAORenewals } from "@/hooks/useMyAORenewals";
import { useNavigate } from "react-router-dom";
import { Calendar, ExternalLink, AlertTriangle } from "lucide-react";
import { format, differenceInDays } from "date-fns";

export function MyAORenewalsCard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useMyAORenewals(5, true); // Get top 5, exclude completed

  const formatCurrency = (value: number | null) => {
    if (!value) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getDaysUntilRenewal = (renewalDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewal = new Date(renewalDate);
    return differenceInDays(renewal, today);
  };

  const getUrgencyStyle = (daysUntil: number) => {
    if (daysUntil < 0) {
      return "text-red-600 bg-red-50 dark:bg-red-950";
    } else if (daysUntil <= 7) {
      return "text-orange-600 bg-orange-50 dark:bg-orange-950";
    } else if (daysUntil <= 14) {
      return "text-yellow-600 bg-yellow-50 dark:bg-yellow-950";
    }
    return "";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              My Auto-Owners Renewals
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            My Auto-Owners Renewals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load renewals. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const renewals = data?.renewals || [];
  const stats = data?.stats;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            My Auto-Owners Renewals
            {stats && stats.count > 0 && (
              <Badge variant="secondary" className="ml-2">
                {stats.count}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/ao-renewals?assigned=me")}
          >
            View All
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
        {stats && stats.upcomingWithin7Days > 0 && (
          <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
            <AlertTriangle className="h-3 w-3" />
            {stats.upcomingWithin7Days} renewal{stats.upcomingWithin7Days !== 1 ? 's' : ''} due within 7 days
          </p>
        )}
      </CardHeader>
      <CardContent>
        {renewals.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No renewals assigned to you
            </p>
            <Button
              variant="link"
              size="sm"
              onClick={() => navigate("/ao-renewals")}
              className="mt-2"
            >
              Browse all renewals
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2 pb-1 border-b">
              <div className="col-span-4">Customer</div>
              <div className="col-span-3">Policy #</div>
              <div className="col-span-3">Renewal</div>
              <div className="col-span-2 text-right">Premium</div>
            </div>

            {/* Renewal Rows */}
            {renewals.map((renewal) => {
              const daysUntil = getDaysUntilRenewal(renewal.renewal_date);
              const urgencyStyle = getUrgencyStyle(daysUntil);

              return (
                <div
                  key={renewal.id}
                  className={`grid grid-cols-12 gap-2 text-sm p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors ${urgencyStyle}`}
                  onClick={() => navigate(`/ao-renewals/${renewal.id}/edit`)}
                >
                  <div className="col-span-4 font-medium truncate" title={renewal.customer_name}>
                    {renewal.customer_name}
                  </div>
                  <div className="col-span-3 font-mono text-xs truncate" title={renewal.policy_number}>
                    {renewal.policy_number}
                  </div>
                  <div className="col-span-3 text-xs">
                    {format(new Date(renewal.renewal_date), "MMM d")}
                    {daysUntil <= 7 && daysUntil >= 0 && (
                      <span className="ml-1 text-orange-600 font-medium">
                        ({daysUntil}d)
                      </span>
                    )}
                    {daysUntil < 0 && (
                      <span className="ml-1 text-red-600 font-medium">
                        (past)
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right text-xs font-medium">
                    {formatCurrency(renewal.current_premium)}
                  </div>
                </div>
              );
            })}

            {/* Show "more" indicator if there are more than 5 */}
            {stats && stats.count > 5 && (
              <div className="pt-2 text-center">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => navigate("/ao-renewals?assigned=me")}
                >
                  + {stats.count - 5} more renewal{stats.count - 5 !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
