import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Calendar,
  Mail,
  Phone,
  MessageSquare,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface RenewalCampaignManagerProps {
  renewalId: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  campaign_type: string;
  created_at: string;
}

// Campaign templates with touchpoints
const CAMPAIGN_TEMPLATES = {
  standard: {
    name: 'Standard Renewal Campaign',
    touchpoints: [
      { day: 0, type: 'email', action: 'Renewal reminder email' },
      { day: 7, type: 'call', action: 'Check-in call' },
      { day: 14, type: 'sms', action: 'Renewal reminder SMS' },
    ]
  },
  high_risk: {
    name: 'High Risk Renewal Campaign',
    touchpoints: [
      { day: 0, type: 'call', action: 'Urgent renewal call' },
      { day: 1, type: 'email', action: 'Urgent renewal email' },
      { day: 3, type: 'sms', action: 'Urgent renewal SMS' },
      { day: 7, type: 'call', action: 'Follow-up call' },
    ]
  },
  low_engagement: {
    name: 'Low Engagement Campaign',
    touchpoints: [
      { day: 0, type: 'call', action: 'Re-engagement call' },
      { day: 2, type: 'email', action: 'Value reminder email' },
      { day: 7, type: 'sms', action: 'Check-in SMS' },
    ]
  },
  price_sensitive: {
    name: 'Price Sensitive Campaign',
    touchpoints: [
      { day: 0, type: 'email', action: 'Rate comparison email' },
      { day: 3, type: 'call', action: 'Coverage review call' },
      { day: 7, type: 'email', action: 'Discount opportunities email' },
    ]
  }
};

export default function RenewalCampaignManager({ renewalId }: RenewalCampaignManagerProps) {
  const [campaignType, setCampaignType] = useState<string>('standard');
  const [notes, setNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activeCampaigns, setActiveCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // Load active campaigns for this renewal
  useEffect(() => {
    const loadCampaigns = async () => {
      try {
        const { data, error } = await supabase
          .from('nurture_campaigns')
          .select('id, name, status, campaign_type, created_at')
          .eq('renewal_id', renewalId)
          .in('status', ['active', 'scheduled'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        setActiveCampaigns((data || []) as Campaign[]);
      } catch (err) {
        console.error('Error loading campaigns:', err);
      } finally {
        setLoadingCampaigns(false);
      }
    };
    loadCampaigns();
  }, [renewalId]);

  const handleCreateCampaign = async () => {
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const template = CAMPAIGN_TEMPLATES[campaignType as keyof typeof CAMPAIGN_TEMPLATES];

      // Create the campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('nurture_campaigns')
        .insert({
          name: template.name,
          campaign_type: campaignType,
          status: 'active',
          renewal_id: renewalId,
          notes: notes || null,
          created_by: user.id,
          touchpoint_config: template.touchpoints,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create scheduled tasks for each touchpoint
      const tasks = template.touchpoints.map(tp => {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + tp.day);

        return {
          title: tp.action,
          description: `Campaign: ${template.name}\nType: ${tp.type}\nRenewal ID: ${renewalId}`,
          priority: campaignType === 'high_risk' ? 'high' : 'medium',
          status: 'pending',
          due_date: scheduledDate.toISOString(),
          created_by: user.id,
          category: 'renewal',
          metadata: {
            campaign_id: campaign?.id,
            touchpoint_type: tp.type,
            touchpoint_day: tp.day,
            renewal_id: renewalId,
          }
        };
      });

      const { error: tasksError } = await supabase.from('tasks').insert(tasks);
      if (tasksError) {
        console.error('Error creating tasks:', tasksError);
        // Continue anyway - campaign was created
      }

      toast.success('Campaign created successfully');
      setActiveCampaigns(prev => [...prev, campaign as Campaign]);
      setNotes('');
    } catch (error) {
      console.error('Campaign creation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create campaign');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('nurture_campaigns')
        .update({ status: 'paused' })
        .eq('id', campaignId);

      if (error) throw error;

      setActiveCampaigns(prev =>
        prev.map(c => c.id === campaignId ? { ...c, status: 'paused' } : c)
      );
      toast.success('Campaign paused');
    } catch (error) {
      toast.error('Failed to pause campaign');
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('nurture_campaigns')
        .update({ status: 'active' })
        .eq('id', campaignId);

      if (error) throw error;

      setActiveCampaigns(prev =>
        prev.map(c => c.id === campaignId ? { ...c, status: 'active' } : c)
      );
      toast.success('Campaign resumed');
    } catch (error) {
      toast.error('Failed to resume campaign');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Renewal Campaign Manager</h2>
        <p className="text-muted-foreground">
          Create and manage automated renewal campaigns
        </p>
      </div>

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Create Campaign</TabsTrigger>
          <TabsTrigger value="active">Active Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Configuration</CardTitle>
              <CardDescription>
                Set up an automated renewal campaign for this policy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-type">Campaign Type</Label>
                <Select value={campaignType} onValueChange={setCampaignType}>
                  <SelectTrigger id="campaign-type">
                    <SelectValue placeholder="Select campaign type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard Renewal</SelectItem>
                    <SelectItem value="high_risk">High Risk</SelectItem>
                    <SelectItem value="low_engagement">Low Engagement</SelectItem>
                    <SelectItem value="price_sensitive">Price Sensitive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Campaign Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any special instructions or notes for this campaign..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Campaign Preview */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="font-medium">Planned Touchpoints:</div>
                
                {campaignType === 'high_risk' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 0</Badge>
                      <Phone className="h-4 w-4" />
                      <span>Urgent renewal call</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 1</Badge>
                      <Mail className="h-4 w-4" />
                      <span>Urgent renewal email</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 3</Badge>
                      <MessageSquare className="h-4 w-4" />
                      <span>Urgent renewal SMS</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 7</Badge>
                      <Phone className="h-4 w-4" />
                      <span>Follow-up call</span>
                    </div>
                  </div>
                )}

                {campaignType === 'standard' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 0</Badge>
                      <Mail className="h-4 w-4" />
                      <span>Renewal reminder email</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 7</Badge>
                      <Phone className="h-4 w-4" />
                      <span>Check-in call</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 14</Badge>
                      <MessageSquare className="h-4 w-4" />
                      <span>Renewal reminder SMS</span>
                    </div>
                  </div>
                )}

                {campaignType === 'low_engagement' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 0</Badge>
                      <Phone className="h-4 w-4" />
                      <span>Re-engagement call</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 2</Badge>
                      <Mail className="h-4 w-4" />
                      <span>Value reminder email</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 7</Badge>
                      <MessageSquare className="h-4 w-4" />
                      <span>Check-in SMS</span>
                    </div>
                  </div>
                )}

                {campaignType === 'price_sensitive' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 0</Badge>
                      <Mail className="h-4 w-4" />
                      <span>Rate comparison email</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 3</Badge>
                      <Phone className="h-4 w-4" />
                      <span>Coverage review call</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="outline">Day 7</Badge>
                      <Mail className="h-4 w-4" />
                      <span>Discount opportunities email</span>
                    </div>
                  </div>
                )}
              </div>

              <Button 
                onClick={handleCreateCampaign} 
                disabled={isCreating}
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                {isCreating ? 'Creating Campaign...' : 'Start Campaign'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Campaigns</CardTitle>
              <CardDescription>
                View and manage ongoing renewal campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCampaigns ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                  <p>Loading campaigns...</p>
                </div>
              ) : activeCampaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No active campaigns for this renewal</p>
                  <p className="text-sm">Create a campaign to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeCampaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium">{campaign.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Created {new Date(campaign.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                          {campaign.status === 'active' ? (
                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Active</>
                          ) : (
                            <><Pause className="h-3 w-3 mr-1" /> Paused</>
                          )}
                        </Badge>
                        {campaign.status === 'active' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePauseCampaign(campaign.id)}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResumeCampaign(campaign.id)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
