import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  useRenewalsWithRisk,
  useRenewalRiskHistory,
  useRenewalCampaigns,
  useCalculateRenewalRisk
} from '@/hooks/useRenewalRisk';
import {
  useUpdateCampaignTouchpoint,
  useUpdateCampaignStatus
} from '@/hooks/useRenewalCampaigns';
import { 
  ArrowLeft,
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Calendar, 
  DollarSign, 
  RefreshCw,
  Phone,
  Mail,
  MessageSquare,
  CheckCircle,
  User,
  Activity,
  Target,
  Award,
  AlertCircle,
  Edit,
  PlayCircle,
  PauseCircle,
  Plus
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const DetailRenewalView = () => {
  const { renewalId } = useParams<{ renewalId: string }>();
  const navigate = useNavigate();
  
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const { data: allRenewals, isLoading } = useRenewalsWithRisk();
  const { data: riskHistory } = useRenewalRiskHistory(renewalId || '');
  const { data: campaigns } = useRenewalCampaigns(renewalId || '');
  
  const calculateRisk = useCalculateRenewalRisk();
  const updateTouchpoint = useUpdateCampaignTouchpoint();
  const updateCampaignStatus = useUpdateCampaignStatus();

  const renewal = allRenewals?.find(r => r.id === renewalId);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!renewal) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium">Renewal not found</p>
          <Button onClick={() => navigate('/renewals')} className="mt-4">
            Back to Renewals
          </Button>
        </div>
      </div>
    );
  }

  const daysToRenewal = differenceInDays(new Date(renewal.renewal_date), new Date());
  const priceChange = renewal.price_change_pct || 0;
  const activeCampaign = campaigns?.find(c => c.status === 'active');

  const getRiskColor = (level: string | null) => {
    switch (level) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const getRiskBgColor = (level: string | null) => {
    switch (level) {
      case 'critical': return 'bg-red-100 border-red-300';
      case 'high': return 'bg-orange-100 border-orange-300';
      case 'medium': return 'bg-yellow-100 border-yellow-300';
      case 'low': return 'bg-green-100 border-green-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const handleRecalculateRisk = async () => {
    try {
      await calculateRisk.mutateAsync(renewal.id);
      toast.success('Risk score recalculated');
    } catch (error) {
      toast.error('Failed to recalculate risk');
    }
  };

  const handleToggleTouchpoint = async (campaignId: string, index: number, currentStatus: boolean) => {
    try {
      await updateTouchpoint.mutateAsync({
        campaign_id: campaignId,
        touchpoint_index: index,
        completed: !currentStatus
      });
      toast.success('Touchpoint updated');
    } catch (error) {
      toast.error('Failed to update touchpoint');
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      await updateCampaignStatus.mutateAsync({
        campaign_id: campaignId,
        status: 'paused'
      });
      toast.success('Campaign paused');
    } catch (error) {
      toast.error('Failed to pause campaign');
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    try {
      await updateCampaignStatus.mutateAsync({
        campaign_id: campaignId,
        status: 'active'
      });
      toast.success('Campaign resumed');
    } catch (error) {
      toast.error('Failed to resume campaign');
    }
  };

  const handleSaveNote = () => {
    // In production, this would save to a notes table
    toast.success('Note saved');
    setShowNoteDialog(false);
    setNoteContent('');
  };

  // Prepare risk history chart data
  const riskChartData = riskHistory?.map(h => ({
    date: format(new Date(h.calculated_at), 'MMM dd'),
    score: h.risk_score
  })) || [];

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/renewals')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{renewal.account?.name}</h1>
            <p className="text-lg text-muted-foreground mt-1">
              {renewal.policy_type} • {renewal.carrier || 'No carrier'}
            </p>
            <p className="text-sm text-muted-foreground">
              Policy: {renewal.policy_number || 'No policy number'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleRecalculateRisk} disabled={calculateRisk.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${calculateRisk.isPending ? 'animate-spin' : ''}`} />
              Recalculate Risk
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Risk Score & Key Info */}
        <div className="space-y-6">
          {/* Risk Score Card */}
          <Card className={`border-2 ${getRiskBgColor(renewal.risk_level)}`}>
            <CardHeader>
              <CardTitle className="text-center">Risk Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className={`text-6xl font-bold ${getRiskColor(renewal.risk_level)}`}>
                  {renewal.risk_score}
                </div>
                <div className="text-2xl font-semibold mt-2">
                  {renewal.risk_level?.toUpperCase() || 'UNKNOWN'}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Last calculated: {renewal.last_risk_calculation 
                    ? format(new Date(renewal.last_risk_calculation), 'MMM dd, yyyy HH:mm')
                    : 'Never'
                  }
                </div>
              </div>

              {/* Risk Progress Bar */}
              <div className="mt-6">
                <Progress value={renewal.risk_score} className="h-3" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                  <span>Critical</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Key Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Renewal Date</div>
                <div className="text-lg font-semibold">
                  {format(new Date(renewal.renewal_date), 'MMMM dd, yyyy')}
                </div>
                <Badge variant={daysToRenewal < 30 ? 'destructive' : 'secondary'} className="mt-1">
                  {daysToRenewal} days remaining
                </Badge>
              </div>

              <Separator />

              <div>
                <div className="text-sm text-muted-foreground">Premium Change</div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-semibold">
                    ${renewal.current_premium?.toLocaleString() || 'N/A'} → ${renewal.renewal_premium?.toLocaleString() || 'N/A'}
                  </div>
                  {priceChange !== 0 && (
                    <Badge variant={priceChange > 15 ? 'destructive' : 'secondary'} className="flex items-center gap-1">
                      {priceChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-sm text-muted-foreground">Assigned Producer</div>
                <div className="flex items-center gap-2 mt-1">
                  <User className="h-4 w-4" />
                  <span className="font-medium">{renewal.assigned?.full_name || 'Unassigned'}</span>
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-sm text-muted-foreground">Last Contact</div>
                <div className="font-medium">
                  {renewal.last_contact_date 
                    ? format(new Date(renewal.last_contact_date), 'MMM dd, yyyy')
                    : 'No contact recorded'
                  }
                </div>
                {renewal.last_contact_date && (
                  <div className="text-sm text-muted-foreground">
                    {differenceInDays(new Date(), new Date(renewal.last_contact_date))} days ago
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Engagement</div>
                  <div className="flex items-center gap-2">
                    <Progress value={renewal.engagement_score} className="flex-1" />
                    <span className="text-sm font-medium">{renewal.engagement_score}</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Sentiment</div>
                  <div className="flex items-center gap-2">
                    <Progress value={renewal.sentiment_score} className="flex-1" />
                    <span className="text-sm font-medium">{renewal.sentiment_score}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" variant="outline">
                <Phone className="h-4 w-4 mr-2" />
                Call Customer
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <MessageSquare className="h-4 w-4 mr-2" />
                Send SMS
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Meeting
              </Button>
              <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
                <DialogTrigger asChild>
                  <Button className="w-full justify-start" variant="outline">
                    <Edit className="h-4 w-4 mr-2" />
                    Add Note
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Note</DialogTitle>
                    <DialogDescription>
                      Add a note about this renewal
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="note">Note</Label>
                      <Textarea
                        id="note"
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Enter your note here..."
                        rows={5}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveNote}>
                        Save Note
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Detailed Information */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="risk-factors">Risk Factors</TabsTrigger>
              <TabsTrigger value="campaign">Campaign</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Risk Factors Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Risk Factors
                  </CardTitle>
                  <CardDescription>
                    Factors contributing to the current risk score
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {renewal.risk_factors && renewal.risk_factors.length > 0 ? (
                    <div className="space-y-3">
                      {renewal.risk_factors.map((factor, idx) => (
                        <Alert key={idx} variant={factor.severity === 'critical' ? 'destructive' : 'default'}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{factor.factor.replace(/_/g, ' ').toUpperCase()}</div>
                                <div className="text-sm">{factor.details}</div>
                              </div>
                              <Badge variant="outline">+{factor.points} pts</Badge>
                            </div>
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No risk factors identified
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AI Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    AI Recommendations
                  </CardTitle>
                  <CardDescription>
                    Suggested actions based on risk analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {renewal.risk_level === 'critical' || renewal.risk_level === 'high' ? (
                      <>
                        <div className="flex items-start gap-3 p-4 bg-accent rounded-lg">
                          <Phone className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <div className="font-medium">Immediate Phone Call Required</div>
                            <div className="text-sm text-muted-foreground">
                              Contact customer within 24 hours to address concerns and schedule review meeting.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-accent rounded-lg">
                          <DollarSign className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <div className="font-medium">Consider Loyalty Discount</div>
                            <div className="text-sm text-muted-foreground">
                              Offer a 10-15% loyalty discount or bundle savings to retain this customer.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-accent rounded-lg">
                          <Award className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <div className="font-medium">Highlight Value-Add Services</div>
                            <div className="text-sm text-muted-foreground">
                              Emphasize 24/7 support, claims advocacy, and personalized service during conversation.
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start gap-3 p-4 bg-accent rounded-lg">
                          <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                          <div>
                            <div className="font-medium">Standard Renewal Process</div>
                            <div className="text-sm text-muted-foreground">
                              Follow standard renewal workflow with email touchpoints.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-4 bg-accent rounded-lg">
                          <Target className="h-5 w-5 text-primary mt-0.5" />
                          <div>
                            <div className="font-medium">Cross-Sell Opportunity</div>
                            <div className="text-sm text-muted-foreground">
                              Consider offering additional coverage options or bundling with other policies.
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Status Indicators */}
              <Card>
                <CardHeader>
                  <CardTitle>Status Indicators</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-4 border rounded-lg">
                      {renewal.has_recent_claim ? (
                        <AlertCircle className="h-8 w-8 text-orange-600" />
                      ) : (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      )}
                      <div>
                        <div className="font-medium">Recent Claims</div>
                        <div className="text-sm text-muted-foreground">
                          {renewal.has_recent_claim ? 'Has recent claims' : 'No recent claims'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 border rounded-lg">
                      {renewal.has_payment_issues ? (
                        <AlertCircle className="h-8 w-8 text-orange-600" />
                      ) : (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      )}
                      <div>
                        <div className="font-medium">Payment History</div>
                        <div className="text-sm text-muted-foreground">
                          {renewal.has_payment_issues ? 'Payment issues detected' : 'Good payment history'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 border rounded-lg">
                      {renewal.competitor_activity_detected ? (
                        <AlertCircle className="h-8 w-8 text-orange-600" />
                      ) : (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      )}
                      <div>
                        <div className="font-medium">Competitor Activity</div>
                        <div className="text-sm text-muted-foreground">
                          {renewal.competitor_activity_detected ? 'Shopping around' : 'No competitor quotes'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 border rounded-lg">
                      <Activity className="h-8 w-8 text-blue-600" />
                      <div>
                        <div className="font-medium">Contact Count</div>
                        <div className="text-sm text-muted-foreground">
                          {renewal.contact_count} interactions
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Risk Factors Tab */}
            <TabsContent value="risk-factors" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Risk Analysis</CardTitle>
                  <CardDescription>
                    Comprehensive breakdown of all risk factors
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {renewal.risk_factors && renewal.risk_factors.length > 0 ? (
                    <div className="space-y-6">
                      {renewal.risk_factors.map((factor, idx) => (
                        <div key={idx} className="border-l-4 border-primary pl-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-lg">
                              {factor.factor.replace(/_/g, ' ').toUpperCase()}
                            </h3>
                            <Badge variant={factor.severity === 'critical' ? 'destructive' : 'default'}>
                              {factor.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground mb-2">{factor.details}</p>
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Points:</span>
                              <span className="font-semibold ml-1">+{factor.points}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-12">
                      No risk factors identified for this renewal
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Campaign Tab */}
            <TabsContent value="campaign" className="space-y-6">
              {activeCampaign ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Active Campaign</CardTitle>
                        <CardDescription>
                          {activeCampaign.campaign_type.replace('_', ' ').toUpperCase()} Campaign
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {activeCampaign.status === 'active' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePauseCampaign(activeCampaign.id)}
                          >
                            <PauseCircle className="h-4 w-4 mr-2" />
                            Pause
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResumeCampaign(activeCampaign.id)}
                          >
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Resume
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Progress</span>
                        <span className="text-sm font-medium">
                          {activeCampaign.completed_touchpoints} / {activeCampaign.total_touchpoints}
                        </span>
                      </div>
                      <Progress
                        value={(activeCampaign.completed_touchpoints / activeCampaign.total_touchpoints) * 100}
                      />
                    </div>

                    <div className="space-y-3">
                      {(activeCampaign.touchpoints[]).map((touchpoint, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 p-4 border rounded-lg ${
                            touchpoint.completed ? 'bg-accent' : ''
                          }`}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleTouchpoint(activeCampaign.id, idx, touchpoint.completed)}
                          >
                            {touchpoint.completed ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : (
                              <div className="h-5 w-5 border-2 rounded-full" />
                            )}
                          </Button>
                          <div className="flex-1">
                            <div className="font-medium capitalize">
                              Day {touchpoint.day}: {touchpoint.type}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Template: {touchpoint.template}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2">No Active Campaign</p>
                    <p className="text-muted-foreground mb-4">
                      Create a renewal campaign to manage touchpoints
                    </p>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Campaign
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Risk Score History</CardTitle>
                  <CardDescription>
                    Historical risk score trends
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {riskChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={riskChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="score" stroke="#8884d8" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-muted-foreground py-12">
                      No risk history available yet
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default DetailRenewalView;
