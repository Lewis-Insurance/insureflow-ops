import { useState } from 'react';
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

interface RenewalCampaignManagerProps {
  renewalId: string;
}

export default function RenewalCampaignManager({ renewalId }: RenewalCampaignManagerProps) {
  const [campaignType, setCampaignType] = useState<string>('standard');
  const [notes, setNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateCampaign = async () => {
    setIsCreating(true);
    try {
      // TODO: Call edge function or mutation to create campaign
      toast.success('Campaign created successfully');
    } catch (error) {
      toast.error('Failed to create campaign');
      console.error(error);
    } finally {
      setIsCreating(false);
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
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No active campaigns for this renewal</p>
                <p className="text-sm">Create a campaign to get started</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
