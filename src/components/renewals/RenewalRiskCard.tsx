import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, 
  Calendar, 
  DollarSign,
  Phone,
  Mail,
  MessageSquare,
  RefreshCw
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useCalculateRenewalRisk } from '@/hooks/useRenewalIntelligence';
import type { AtRiskRenewal } from '@/hooks/useRenewalIntelligence';

interface RenewalRiskCardProps {
  renewal: AtRiskRenewal;
}

export default function RenewalRiskCard({ renewal }: RenewalRiskCardProps) {
  const calculateRisk = useCalculateRenewalRisk();

  const getRiskColor = (level: string) => {
    const colors = {
      critical: 'destructive',
      high: 'orange',
      medium: 'yellow',
      low: 'green',
    };
    return colors[level as keyof typeof colors] || 'secondary';
  };

  const getRiskLabel = (level: string) => {
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  const daysToRenewal = renewal.renewal_date 
    ? differenceInDays(new Date(renewal.renewal_date), new Date())
    : 0;

  const priceChange = renewal.price_increase_pct || 0;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {renewal.carrier} - {renewal.policy_type}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Policy #{renewal.policy_number}
            </p>
          </div>
          <Badge variant={getRiskColor(renewal.risk_level) as any}>
            <AlertTriangle className="h-3 w-3 mr-1" />
            {getRiskLabel(renewal.risk_level)} Risk
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 mr-2" />
              Renewal Date
            </div>
            <p className="text-sm font-medium">
              {renewal.renewal_date 
                ? format(new Date(renewal.renewal_date), 'MMM d, yyyy')
                : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">
              {daysToRenewal > 0 ? `${daysToRenewal} days away` : 'Overdue'}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4 mr-2" />
              Premium
            </div>
            <p className="text-sm font-medium">
              ${renewal.renewal_premium?.toLocaleString() || 0}
            </p>
            {priceChange !== 0 && (
              <p className={`text-xs ${priceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}% change
              </p>
            )}
          </div>
        </div>

        {/* Risk Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Risk Score</span>
            <span className="font-semibold">{renewal.risk_score || 0}/100</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full ${
                (renewal.risk_score || 0) >= 75 ? 'bg-red-500' :
                (renewal.risk_score || 0) >= 50 ? 'bg-orange-500' :
                (renewal.risk_score || 0) >= 25 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${renewal.risk_score || 0}%` }}
            />
          </div>
        </div>

        {/* Risk Factors */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Risk Factors:</p>
          <div className="flex flex-wrap gap-2">
            {renewal.has_recent_claim && (
              <Badge variant="outline" className="text-xs">Recent Claim</Badge>
            )}
            {renewal.has_payment_issues && (
              <Badge variant="outline" className="text-xs">Payment Issues</Badge>
            )}
            {renewal.competitor_activity_detected && (
              <Badge variant="outline" className="text-xs">Competitor Activity</Badge>
            )}
            {renewal.engagement_score && renewal.engagement_score < 50 && (
              <Badge variant="outline" className="text-xs">Low Engagement</Badge>
            )}
            {renewal.sentiment_score && renewal.sentiment_score < 50 && (
              <Badge variant="outline" className="text-xs">Negative Sentiment</Badge>
            )}
            {priceChange > 15 && (
              <Badge variant="outline" className="text-xs">High Price Increase</Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Phone className="h-4 w-4 mr-2" />
            Call
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <Mail className="h-4 w-4 mr-2" />
            Email
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <MessageSquare className="h-4 w-4 mr-2" />
            SMS
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => calculateRisk.mutate(renewal.id)}
            disabled={calculateRisk.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${calculateRisk.isPending ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
