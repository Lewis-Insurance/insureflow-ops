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
  Phone, 
  Mail, 
  MessageSquare,
  Eye,
  Play,
  RefreshCw,
  User,
  Building2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useCalculateRenewalRisk } from '@/hooks/useRenewalIntelligence';
import type { AtRiskRenewal } from '@/hooks/useRenewalIntelligence';
import RenewalCampaignManager from './RenewalCampaignManager';

interface RenewalRiskCardProps {
  renewal: AtRiskRenewal;
}

export default function RenewalRiskCard({ renewal }: RenewalRiskCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showCampaignManager, setShowCampaignManager] = useState(false);
  const calculateRisk = useCalculateRenewalRisk();

  const getRiskColor = (level?: string) => {
    const colors = {
      critical: 'destructive',
      high: 'orange',
      medium: 'yellow',
      low: 'green',
    };
    return colors[(level || 'low') as keyof typeof colors] || 'secondary';
  };

  const getRiskLabel = (level?: string) => {
    return (level || 'low').charAt(0).toUpperCase() + (level || 'low').slice(1);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const daysToRenewal = renewal.renewal_date 
    ? differenceInDays(new Date(renewal.renewal_date), new Date())
    : 0;

  const priceChange = renewal.price_change_pct || 0;

  const riskFactors = renewal.risk_factors || {};
  const activeRiskFactors = Object.entries(riskFactors).filter(([_, value]) => value === true);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg">
              {renewal.carrier} - {renewal.policy_type}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Policy #{renewal.policy_number}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={getRiskColor(renewal.risk_level)}>
              <AlertTriangle className="h-3 w-3 mr-1" />
              {getRiskLabel(renewal.risk_level)} Risk
            </Badge>
            {renewal.campaign_type && (
              <Badge variant="outline" className="text-xs">
                Campaign Active
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Key Metrics Grid */}
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
              {formatCurrency(renewal.renewal_premium)}
            </p>
            {priceChange !== 0 && (
              <p className={`text-xs ${priceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}% change
              </p>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 mr-2" />
              Engagement
            </div>
            <p className="text-sm font-medium">
              {renewal.engagement_score || 0}/100
            </p>
            <p className="text-xs text-muted-foreground">
              {renewal.contact_count || 0} contacts
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Last Contact
            </div>
            <p className="text-sm font-medium">
              {renewal.days_since_last_contact || 0} days ago
            </p>
          </div>
        </div>

        {/* Risk Score Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Risk Score</span>
            <span className="font-semibold">{renewal.risk_score || 0}/100</span>
          </div>
          <Progress value={renewal.risk_score || 0} className="h-2" />
        </div>

        {/* Risk Factors */}
        {activeRiskFactors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Active Risk Factors:</p>
            <div className="flex flex-wrap gap-2">
              {activeRiskFactors.map(([factor, _]) => (
                <Badge key={factor} variant="outline" className="text-xs">
                  {factor.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Campaign Progress (if active) */}
        {renewal.campaign_type && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Campaign Progress</span>
              <span className="font-medium">
                {renewal.completed_touchpoints}/{renewal.total_touchpoints} touchpoints
              </span>
            </div>
            <Progress 
              value={(renewal.completed_touchpoints / renewal.total_touchpoints) * 100} 
              className="h-1" 
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Phone className="h-4 w-4 mr-1" />
            Call
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <Mail className="h-4 w-4 mr-1" />
            Email
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <MessageSquare className="h-4 w-4 mr-1" />
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

        {/* Detailed Actions */}
        <div className="flex gap-2 pt-2 border-t">
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
              
              <div className="space-y-6">
                {/* Policy Information */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Policy Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Carrier</div>
                      <div className="text-sm">{renewal.carrier}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Policy Type</div>
                      <div className="text-sm">{renewal.policy_type}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Policy Number</div>
                      <div className="text-sm">{renewal.policy_number}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Status</div>
                      <div className="text-sm capitalize">{renewal.status}</div>
                    </div>
                  </div>
                </div>

                {/* Premium Details */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Premium Details
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Current Premium</div>
                      <div className="text-sm font-medium">{formatCurrency(renewal.current_premium)}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Renewal Premium</div>
                      <div className="text-sm font-medium">{formatCurrency(renewal.renewal_premium)}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Price Change</div>
                      <div className={`text-sm font-medium ${priceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Dollar Change</div>
                      <div className={`text-sm font-medium ${priceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency((renewal.renewal_premium - renewal.current_premium))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Engagement Metrics */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Engagement Metrics
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Engagement Score</div>
                      <div className="text-sm">{renewal.engagement_score}/100</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Sentiment Score</div>
                      <div className="text-sm">{renewal.sentiment_score}/100</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Customer Satisfaction</div>
                      <div className="text-sm">{renewal.customer_satisfaction_score}/100</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Contact Count</div>
                      <div className="text-sm">{renewal.contact_count} contacts</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Days Since Last Contact</div>
                      <div className="text-sm">{renewal.days_since_last_contact} days</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Last Contact</div>
                      <div className="text-sm">
                        {renewal.last_contact_date 
                          ? format(new Date(renewal.last_contact_date), 'MMM d, yyyy')
                          : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk Indicators */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Risk Indicators
                  </h4>
                  <div className="space-y-2">
                    {renewal.has_recent_claim && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span>Recent claim activity detected</span>
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
                    {renewal.days_since_last_contact > 90 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span>Low contact frequency (90+ days)</span>
                      </div>
                    )}
                    {priceChange > 15 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-orange-500" />
                        <span>High price increase (&gt;15%)</span>
                      </div>
                    )}
                    {renewal.engagement_score < 50 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span>Low engagement score</span>
                      </div>
                    )}
                    {renewal.sentiment_score < 50 && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span>Negative sentiment detected</span>
                      </div>
                    )}
                    {activeRiskFactors.length === 0 && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <span>No active risk indicators</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Important Dates
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Renewal Date</div>
                      <div className="text-sm">
                        {renewal.renewal_date 
                          ? format(new Date(renewal.renewal_date), 'MMM d, yyyy')
                          : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Expiration Date</div>
                      <div className="text-sm">
                        {renewal.expiration_date 
                          ? format(new Date(renewal.expiration_date), 'MMM d, yyyy')
                          : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Days to Renewal</div>
                      <div className="text-sm">
                        {daysToRenewal > 0 ? `${daysToRenewal} days` : 'Overdue'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Last Risk Calculation</div>
                      <div className="text-sm">
                        {renewal.last_risk_calculation 
                          ? format(new Date(renewal.last_risk_calculation), 'MMM d, yyyy h:mm a')
                          : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showCampaignManager} onOpenChange={setShowCampaignManager}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex-1">
                <Play className="h-4 w-4 mr-1" />
                {renewal.campaign_type ? 'Manage Campaign' : 'Start Campaign'}
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
