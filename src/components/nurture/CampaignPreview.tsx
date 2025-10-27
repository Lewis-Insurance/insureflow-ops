import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, MessageSquare, CheckSquare, Webhook, Clock, Filter } from 'lucide-react';

interface CampaignStep {
  step_number: number;
  delay_value: number;
  delay_unit: string;
  channel: string;
  template_id: string | null;
}

interface CampaignPreviewProps {
  name: string;
  description: string;
  triggerConditions: any;
  steps: CampaignStep[];
}

export function CampaignPreview({
  name,
  description,
  triggerConditions,
  steps,
}: CampaignPreviewProps) {
  const getChannelIcon = (channel: string) => {
    const icons = {
      email: <Mail className="h-4 w-4" />,
      sms: <MessageSquare className="h-4 w-4" />,
      task: <CheckSquare className="h-4 w-4" />,
      webhook: <Webhook className="h-4 w-4" />,
    };
    return icons[channel as keyof typeof icons] || null;
  };

  const getTriggerSummary = () => {
    const parts: string[] = [];

    if (triggerConditions.lead_status?.length > 0) {
      parts.push(`Status: ${triggerConditions.lead_status.join(', ')}`);
    }

    if (
      triggerConditions.lead_score_min !== undefined ||
      triggerConditions.lead_score_max !== undefined
    ) {
      const min = triggerConditions.lead_score_min || 0;
      const max = triggerConditions.lead_score_max || 100;
      parts.push(`Score: ${min}-${max}`);
    }

    if (triggerConditions.tags?.length > 0) {
      parts.push(`Tags: ${triggerConditions.tags.length}`);
    }

    return parts.length > 0 ? parts.join(' • ') : 'No triggers set';
  };

  const calculateTotalTime = () => {
    let totalMinutes = 0;

    steps.forEach((step) => {
      switch (step.delay_unit) {
        case 'minutes':
          totalMinutes += step.delay_value;
          break;
        case 'hours':
          totalMinutes += step.delay_value * 60;
          break;
        case 'days':
          totalMinutes += step.delay_value * 24 * 60;
          break;
        case 'weeks':
          totalMinutes += step.delay_value * 7 * 24 * 60;
          break;
      }
    });

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else if (totalMinutes < 24 * 60) {
      return `${Math.floor(totalMinutes / 60)} hours`;
    } else {
      return `${Math.floor(totalMinutes / (24 * 60))} days`;
    }
  };

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle className="text-lg">Campaign Preview</CardTitle>
        <CardDescription>Overview of your nurture sequence</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Campaign Name */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Campaign Name</p>
          <p className="font-medium">{name || 'Untitled Campaign'}</p>
        </div>

        {/* Description */}
        {description && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
            <p className="text-sm">{description}</p>
          </div>
        )}

        <Separator />

        {/* Trigger Conditions */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Enrollment Triggers</p>
          </div>
          <p className="text-sm text-muted-foreground">{getTriggerSummary()}</p>
        </div>

        <Separator />

        {/* Campaign Steps */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Campaign Steps</p>
            <Badge variant="secondary">{steps.length} steps</Badge>
          </div>

          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No steps added</p>
          ) : (
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={index} className="relative pl-6 pb-3">
                  {/* Timeline connector */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-2 top-6 bottom-0 w-px bg-border" />
                  )}

                  {/* Step content */}
                  <div className="relative">
                    <div className="absolute -left-6 top-0 w-4 h-4 rounded-full bg-primary" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getChannelIcon(step.channel)}
                        <span className="text-sm font-medium capitalize">{step.channel}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Wait {step.delay_value} {step.delay_unit}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {steps.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Duration</span>
                <span className="font-medium">{calculateTotalTime()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Email Steps</span>
                <span className="font-medium">
                  {steps.filter((s) => s.channel === 'email').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SMS Steps</span>
                <span className="font-medium">
                  {steps.filter((s) => s.channel === 'sms').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Task Steps</span>
                <span className="font-medium">
                  {steps.filter((s) => s.channel === 'task').length}
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
