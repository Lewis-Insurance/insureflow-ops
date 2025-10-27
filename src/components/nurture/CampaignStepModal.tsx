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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  const [formData, setFormData] = useState<CampaignStep | null>(null);

  const { data: emailTemplates } = useMessageTemplates('email');
  const { data: smsTemplates } = useMessageTemplates('sms');

  useEffect(() => {
    if (step) {
      setFormData(step);
    }
  }, [step]);

  const handleSave = () => {
    if (formData) {
      onSave(formData);
      onOpenChange(false);
    }
  };

  const updateFormData = (updates: Partial<CampaignStep>) => {
    if (formData) {
      setFormData({ ...formData, ...updates });
    }
  };

  const getAvailableTemplates = () => {
    if (formData?.channel === 'email') return emailTemplates || [];
    if (formData?.channel === 'sms') return smsTemplates || [];
    return [];
  };

  if (!formData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configure Campaign Step</DialogTitle>
          <DialogDescription>
            Set up the timing, channel, and content for this step
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Delay Settings */}
          <div className="space-y-3">
            <Label>Wait Time</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="delay-value" className="text-sm text-muted-foreground">
                  Duration
                </Label>
                <Input
                  id="delay-value"
                  type="number"
                  min="0"
                  value={formData.delay_value}
                  onChange={(e) =>
                    updateFormData({ delay_value: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delay-unit" className="text-sm text-muted-foreground">
                  Unit
                </Label>
                <Select
                  value={formData.delay_unit}
                  onValueChange={(value) =>
                    updateFormData({ delay_unit: value as any })
                  }
                >
                  <SelectTrigger id="delay-unit">
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
              Wait {formData.delay_value} {formData.delay_unit} before executing this step
            </p>
          </div>

          {/* Channel Selection */}
          <div className="space-y-3">
            <Label>Communication Channel</Label>
            <div className="grid grid-cols-4 gap-3">
              {[
                { value: 'email', icon: Mail, label: 'Email' },
                { value: 'sms', icon: MessageSquare, label: 'SMS' },
                { value: 'task', icon: CheckSquare, label: 'Task' },
                { value: 'webhook', icon: Webhook, label: 'Webhook' },
              ].map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => updateFormData({ channel: value as any, template_id: null })}
                  className={`p-4 border rounded-lg flex flex-col items-center gap-2 transition-colors ${
                    formData.channel === value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template Selection for Email/SMS */}
          {(formData.channel === 'email' || formData.channel === 'sms') && (
            <div className="space-y-3">
              <Label>Message Template</Label>
              <Select
                value={formData.template_id || ''}
                onValueChange={(value) => updateFormData({ template_id: value || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableTemplates().map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                  {getAvailableTemplates().length === 0 && (
                    <SelectItem value="none" disabled>
                      No templates available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Task Configuration */}
          {formData.channel === 'task' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="task-title">Task Title</Label>
                <Input
                  id="task-title"
                  placeholder="e.g., Follow up with lead"
                  value={formData.action_data?.title || ''}
                  onChange={(e) =>
                    updateFormData({
                      action_data: { ...formData.action_data, title: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-description">Task Description</Label>
                <Textarea
                  id="task-description"
                  placeholder="Describe what needs to be done..."
                  value={formData.action_data?.description || ''}
                  onChange={(e) =>
                    updateFormData({
                      action_data: { ...formData.action_data, description: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}

          {/* Webhook Configuration */}
          {formData.channel === 'webhook' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://example.com/webhook"
                  value={formData.action_data?.url || ''}
                  onChange={(e) =>
                    updateFormData({
                      action_data: { ...formData.action_data, url: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Step</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
