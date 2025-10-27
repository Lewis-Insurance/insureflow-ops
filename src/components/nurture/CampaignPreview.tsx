import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, MessageSquare, CheckSquare, Webhook, Clock, ArrowDown } from 'lucide-react';

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

export function CampaignPreview({ name, description, triggerConditions, steps }: CampaignPreviewProps) {
  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle>Campaign Preview</CardTitle>
        <CardDescription>How your campaign will execute</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Campaign Info */}
        <div>
          <h3 className="font-semibold mb-2">{name || 'Untitled Campaign'}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        <Separator />

        {/* Trigger Conditions */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Enrollment Triggers</h4>
          <div className="space-y-2">
            {triggerConditions.lead_status?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {triggerConditions.lead_status.map((status: string) => (
                  <Badge key={status} variant="outline" className="text-xs">
                    {status}
                  </Badge>
                ))}
              </div>
            )}
            {(triggerConditions.lead_score_min || triggerConditions.lead_score_max) && (
              <p className="text-xs text-muted-foreground">
                Score: {triggerConditions.lead_score_min || 0} - {triggerConditions.lead_score_max || 100}
              </p>
            )}
            {triggerConditions.insurance_types?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {triggerConditions.insurance_types.map((type: string) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Steps Timeline */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Campaign Flow</h4>
          {steps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No steps configured</p>
          ) : (
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-start gap-2 text-xs">
                    <div className="mt-1">
                      {step.channel === 'email' && <Mail className="h-3 w-3" />}
                      {step.channel === 'sms' && <MessageSquare className="h-3 w-3" />}
                      {step.channel === 'task' && <CheckSquare className="h-3 w-3" />}
                      {step.channel === 'webhook' && <Webhook className="h-3 w-3" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        Step {step.step_number}: {step.channel.toUpperCase()}
                      </p>
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Wait {step.delay_value} {step.delay_unit}
                      </p>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="pl-2">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
