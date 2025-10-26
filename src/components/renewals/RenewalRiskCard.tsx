import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Eye,
  Play
} from 'lucide-react';
import { format } from 'date-fns';
import { AtRiskRenewal } from '@/hooks/useRenewalIntelligence';
import RenewalCampaignManager from './RenewalCampaignManager';

interface RenewalRiskCardProps {
  renewal: AtRiskRenewal;
}

export default function RenewalRiskCard({ renewal }: RenewalRiskCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showCampaignManager, setShowCampaignManager] = useState(false);

  const getRiskBadgeVariant = (level?: string): "default" | "destructive" | "outline" | "secondary" => {
    if (!level) return 'default';
    const variants = {
      critical: 'destructive' as const,
      high: 'destructive' as const,
      medium: 'default' as const,
      low: 'secondary' as const,
    };
    return variants[level as keyof typeof variants] || 'default';
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{renewal.policy_number}</CardTitle>
              <Badge variant={getRiskBadgeVariant(renewal.risk_level)}>
                {renewal.risk_level?.toUpperCase() || 'UNKNOWN'}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{renewal.carrier}</span>
                <span>•</span>
                <span>{renewal.policy_type}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{renewal.risk_score || 0}</div>
            <div className="text-xs text-muted-foreground">Risk Score</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Risk Score Progress */}
        <div>
          <div className="flex items-center justify-between mb-1 text-sm">
            <span>Risk Level</span>
            <span>{renewal.risk_score || 0}/100</span>
          </div>
          <Progress value={renewal.risk_score || 0} className="h-2" />
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Renewal Date
            </div>
            <div className="font-medium">
              {renewal.renewal_date ? format(new Date(renewal.renewal_date), 'MMM dd, yyyy') : 'N/A'}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Premium
            </div>
            <div className="font-medium">
              {formatCurrency(renewal.renewal_premium)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Price Change
            </div>
            <div className={`font-medium ${(renewal.price_increase_pct || 0) > 10 ? 'text-red-600' : ''}`}>
              {(renewal.price_increase_pct || 0) > 0 ? '+' : ''}{renewal.price_increase_pct?.toFixed(1) || '0.0'}%
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Last Contact
            </div>
            <div className="font-medium">
              {renewal.last_contact_date 
                ? `${Math.floor((Date.now() - new Date(renewal.last_contact_date).getTime()) / (1000 * 60 * 60 * 24))} days ago`
                : 'No contact'}
            </div>
          </div>
        </div>

        {/* Risk Factors */}
        {(renewal.has_recent_claim || renewal.has_payment_issues || renewal.competitor_activity_detected) && (
          <div>
            <div className="text-xs font-medium mb-2">Active Risk Factors:</div>
            <div className="flex flex-wrap gap-1">
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
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Dialog open={showDetails} onOpenChange={setShowDetails}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                <Eye className="h-4 w-4 mr-1" />
                View Details
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Renewal Details - {renewal.policy_number}</DialogTitle>
                <DialogDescription>
                  Complete risk analysis and renewal information
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium">Carrier</div>
                    <div>{renewal.carrier}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Policy Type</div>
                    <div>{renewal.policy_type}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Current Premium</div>
                    <div>{formatCurrency(renewal.current_premium)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Renewal Premium</div>
                    <div>{formatCurrency(renewal.renewal_premium)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Engagement Score</div>
                    <div>{renewal.engagement_score || 0}/100</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Sentiment Score</div>
                    <div>{renewal.sentiment_score || 0}/100</div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Risk Indicators</div>
                  <div className="space-y-2">
                    {renewal.has_recent_claim && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span>Recent claim activity</span>
                      </div>
                    )}
                    {renewal.has_payment_issues && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span>Payment issues detected</span>
                      </div>
                    )}
                    {renewal.competitor_activity_detected && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-orange-500" />
                        <span>Competitor activity detected</span>
                      </div>
                    )}
                    {renewal.last_contact_date && Math.floor((Date.now() - new Date(renewal.last_contact_date).getTime()) / (1000 * 60 * 60 * 24)) > 90 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span>Low contact frequency</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showCampaignManager} onOpenChange={setShowCampaignManager}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex-1">
                <Play className="h-4 w-4 mr-1" />
                Start Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <RenewalCampaignManager renewalId={renewal.id} />
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
