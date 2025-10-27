import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMessageTemplates } from '@/integrations/supabase/hooks/useNurtureCampaigns';
import { Mail, MessageSquare, CheckSquare, Webhook } from 'lucide-react';

interface CampaignStep {
  id: string;
  step_number: number;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days' | 'weeks';
  channel: 'email' | 'sms' | 'task' | 'webhook';
  template_id: string | null;
  conditions?: any;
  action_data?: any;
}

interface CampaignStepModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: CampaignStep | null;
  onSave: (step: CampaignStep) => void;
}

export function CampaignStepModal({ open, onOpenChange, step, onSave }: CampaignStepModalProps) {
  const [localStep, setLocalStep] = useState<CampaignStep | null>(null);

  // Fetch templates based on channel
  const { data: emailTemplates } = useMessageTemplates('email');
  const { data: smsTemplates } = useMessageTemplates('sms');

  useEffect(() => {
    if (step) {
      setLocalStep({ ...step });
    } else {
      setLocalStep(null);
    }
  }, [step]);

  const handleSave = () => {
    if (localStep) {
      onSave(localStep);
      onOpenChange(false);
    }
  };

  const updateField = (field: keyof CampaignStep, value: any) => {
    if (localStep) {
      setLocalStep({ ...localStep, [field]: value });
    }
  };

  if (!localStep) return null;

  const templates = localStep.channel === 'email' ? emailTemplates : smsTemplates;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Campaign Step</DialogTitle>
          <DialogDescription>
            Set up the timing, channel, and content for this step
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Delay Configuration */}
          <div className="space-y-4">
            <Label>Wait Time Before Execution</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Value</Label>
                <Input
                  type="number"
                  min="0"
                  value={localStep.delay_value}
                  onChange={(e) => updateField('delay_value', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Unit</Label>
                <Select
                  value={localStep.delay_unit}
                  onValueChange={(value: any) => updateField('delay_unit', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Wait {localStep.delay_value} {localStep.delay_unit} before executing this step
            </p>
          </div>

          {/* Channel Selection */}
          <div className="space-y-4">
            <Label>Channel</Label>
            <Tabs
              value={localStep.channel}
              onValueChange={(value: any) => {
                updateField('channel', value);
                updateField('template_id', null); // Reset template when channel changes
              }}
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="email">
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="sms">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  SMS
                </TabsTrigger>
                <TabsTrigger value="task">
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Task
                </TabsTrigger>
                <TabsTrigger value="webhook">
                  <Webhook className="h-4 w-4 mr-2" />
                  Webhook
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Template</Label>
                  <Select
                    value={localStep.template_id || ''}
                    onValueChange={(value) => updateField('template_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select email template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates?.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templates?.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No email templates found. Create one first.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="sms" className="space-y-4">
                <div className="space-y-2">
                  <Label>SMS Template</Label>
                  <Select
                    value={localStep.template_id || ''}
                    onValueChange={(value) => updateField('template_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select SMS template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates?.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templates?.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No SMS templates found. Create one first.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="task" className="space-y-4">
                <div className="space-y-2">
                  <Label>Task Title</Label>
                  <Input
                    placeholder="e.g., Follow up with lead"
                    value={localStep.action_data?.task_title || ''}
                    onChange={(e) =>
                      updateField('action_data', {
                        ...localStep.action_data,
                        task_title: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Task Description</Label>
                  <Input
                    placeholder="Task details..."
                    value={localStep.action_data?.task_description || ''}
                    onChange={(e) =>
                      updateField('action_data', {
                        ...localStep.action_data,
                        task_description: e.target.value,
                      })
                    }
                  />
                </div>
              </TabsContent>

              <TabsContent value="webhook" className="space-y-4">
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <Input
                    type="url"
                    placeholder="https://..."
                    value={localStep.action_data?.webhook_url || ''}
                    onChange={(e) =>
                      updateField('action_data', {
                        ...localStep.action_data,
                        webhook_url: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>HTTP Method</Label>
                  <Select
                    value={localStep.action_data?.webhook_method || 'POST'}
                    onValueChange={(value) =>
                      updateField('action_data', {
                        ...localStep.action_data,
                        webhook_method: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
