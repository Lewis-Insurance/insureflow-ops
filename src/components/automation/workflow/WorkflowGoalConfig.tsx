/**
 * WorkflowGoalConfig - Goal Configuration Panel
 *
 * Configures workflow goals for tracking success metrics.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Target,
  UserCheck,
  ShoppingCart,
  MessageSquare,
  Star,
  Calendar,
  Link,
  FileText,
} from 'lucide-react';

interface WorkflowGoalConfigProps {
  goalType: string | null;
  goalConfig: Record<string, unknown>;
  onGoalTypeChange: (type: string | null) => void;
  onGoalConfigChange: (config: Record<string, unknown>) => void;
}

const GOAL_TYPES = [
  {
    value: 'conversion',
    label: 'Lead Conversion',
    description: 'Contact converts from lead to customer',
    icon: UserCheck,
  },
  {
    value: 'purchase',
    label: 'Policy Purchase',
    description: 'Contact purchases a specific policy type',
    icon: ShoppingCart,
  },
  {
    value: 'reply',
    label: 'Email Reply',
    description: 'Contact replies to a workflow email',
    icon: MessageSquare,
  },
  {
    value: 'click',
    label: 'Link Click',
    description: 'Contact clicks a specific link',
    icon: Link,
  },
  {
    value: 'form_submit',
    label: 'Form Submission',
    description: 'Contact submits a specific form',
    icon: FileText,
  },
  {
    value: 'review',
    label: 'Leave Review',
    description: 'Contact leaves a Google review',
    icon: Star,
  },
  {
    value: 'appointment',
    label: 'Book Appointment',
    description: 'Contact books an appointment',
    icon: Calendar,
  },
];

export function WorkflowGoalConfig({
  goalType,
  goalConfig,
  onGoalTypeChange,
  onGoalConfigChange,
}: WorkflowGoalConfigProps) {
  const updateConfig = (key: string, value: unknown) => {
    onGoalConfigChange({ ...goalConfig, [key]: value });
  };

  const hasGoal = goalType !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Workflow Goals
        </CardTitle>
        <CardDescription>
          Define success metrics to track workflow effectiveness and optionally stop the workflow
          when goals are achieved
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Goals Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Goal Tracking</Label>
            <p className="text-sm text-muted-foreground">
              Track when contacts achieve the desired outcome
            </p>
          </div>
          <Switch
            checked={hasGoal}
            onCheckedChange={(checked) => {
              if (!checked) {
                onGoalTypeChange(null);
                onGoalConfigChange({});
              } else {
                onGoalTypeChange('conversion');
              }
            }}
          />
        </div>

        {hasGoal && (
          <>
            {/* Goal Type Selection */}
            <div className="space-y-4 pt-6 border-t">
              <Label>Goal Type</Label>
              <RadioGroup
                value={goalType || ''}
                onValueChange={(value) => {
                  onGoalTypeChange(value);
                  onGoalConfigChange({}); // Reset config when changing type
                }}
                className="grid grid-cols-2 gap-3"
              >
                {GOAL_TYPES.map((goal) => {
                  const Icon = goal.icon;
                  return (
                    <Label
                      key={goal.value}
                      htmlFor={`goal-${goal.value}`}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        goalType === goal.value
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <RadioGroupItem
                        value={goal.value}
                        id={`goal-${goal.value}`}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">{goal.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{goal.description}</p>
                      </div>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Goal-specific Configuration */}
            <div className="pt-6 border-t space-y-4">
              {goalType === 'conversion' && (
                <ConversionGoalConfig config={goalConfig} onChange={updateConfig} />
              )}

              {goalType === 'purchase' && (
                <PurchaseGoalConfig config={goalConfig} onChange={updateConfig} />
              )}

              {goalType === 'reply' && (
                <ReplyGoalConfig config={goalConfig} onChange={updateConfig} />
              )}

              {goalType === 'click' && (
                <ClickGoalConfig config={goalConfig} onChange={updateConfig} />
              )}

              {goalType === 'form_submit' && (
                <FormSubmitGoalConfig config={goalConfig} onChange={updateConfig} />
              )}

              {goalType === 'review' && (
                <ReviewGoalConfig config={goalConfig} onChange={updateConfig} />
              )}

              {goalType === 'appointment' && (
                <AppointmentGoalConfig config={goalConfig} onChange={updateConfig} />
              )}

              {/* Common Goal Options */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium">Goal Behavior</h4>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Stop Workflow on Goal</p>
                    <p className="text-xs text-muted-foreground">
                      End the workflow when the goal is achieved
                    </p>
                  </div>
                  <Switch
                    checked={(goalConfig.stop_on_goal as boolean) !== false}
                    onCheckedChange={(checked) => updateConfig('stop_on_goal', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Send Notification</p>
                    <p className="text-xs text-muted-foreground">
                      Notify the account owner when goal is achieved
                    </p>
                  </div>
                  <Switch
                    checked={(goalConfig.notify_on_goal as boolean) || false}
                    onCheckedChange={(checked) => updateConfig('notify_on_goal', checked)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Goal Window</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      value={(goalConfig.window_days as number) || 30}
                      onChange={(e) =>
                        updateConfig('window_days', parseInt(e.target.value) || 30)
                      }
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">
                      days after enrollment
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only count goals achieved within this time window
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Goal Configuration Components
// ============================================================================

interface GoalConfigProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function ConversionGoalConfig({ config, onChange }: GoalConfigProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Track when leads convert to customers by purchasing their first policy.
      </p>

      <div className="space-y-2">
        <Label>Policy Type (optional)</Label>
        <Select
          value={(config.policy_type as string) || 'any'}
          onValueChange={(value) => onChange('policy_type', value === 'any' ? undefined : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any policy type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Policy Type</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="home">Home</SelectItem>
            <SelectItem value="life">Life</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Optionally require a specific policy type for conversion
        </p>
      </div>
    </div>
  );
}

function PurchaseGoalConfig({ config, onChange }: GoalConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Policy Type</Label>
        <Select
          value={(config.policy_type as string) || 'any'}
          onValueChange={(value) => onChange('policy_type', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select policy type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Policy Type</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="home">Home</SelectItem>
            <SelectItem value="life">Life</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="umbrella">Umbrella</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Minimum Premium (optional)</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            min="0"
            value={(config.min_premium as number) || ''}
            onChange={(e) =>
              onChange('min_premium', e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="0"
            className="w-32"
          />
        </div>
      </div>
    </div>
  );
}

function ReplyGoalConfig({ config, onChange }: GoalConfigProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Goal is achieved when the contact replies to any email sent by this workflow.
      </p>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Include Auto-Replies</p>
          <p className="text-xs text-muted-foreground">
            Count automatic out-of-office replies as goal completion
          </p>
        </div>
        <Switch
          checked={(config.include_auto_replies as boolean) || false}
          onCheckedChange={(checked) => onChange('include_auto_replies', checked)}
        />
      </div>
    </div>
  );
}

function ClickGoalConfig({ config, onChange }: GoalConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Link URL (optional)</Label>
        <Input
          type="url"
          placeholder="https://example.com/landing-page"
          value={(config.target_url as string) || ''}
          onChange={(e) => onChange('target_url', e.target.value || undefined)}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to track clicks on any link, or specify a URL to track specific clicks
        </p>
      </div>

      <div className="space-y-2">
        <Label>Link Contains (optional)</Label>
        <Input
          placeholder="e.g., /quote, /schedule"
          value={(config.url_contains as string) || ''}
          onChange={(e) => onChange('url_contains', e.target.value || undefined)}
        />
        <p className="text-xs text-muted-foreground">
          Match links containing this text (e.g., "/quote" for any quote-related links)
        </p>
      </div>
    </div>
  );
}

function FormSubmitGoalConfig({ config, onChange }: GoalConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Form</Label>
        <Select
          value={(config.form_id as string) || 'any'}
          onValueChange={(value) => onChange('form_id', value === 'any' ? undefined : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any form" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Form</SelectItem>
            <SelectItem value="quote_request">Quote Request</SelectItem>
            <SelectItem value="contact_form">Contact Form</SelectItem>
            <SelectItem value="referral_form">Referral Form</SelectItem>
            <SelectItem value="review_form">Review Request Form</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ReviewGoalConfig({ config, onChange }: GoalConfigProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Track when contacts leave a Google review after receiving a review request.
      </p>

      <div className="space-y-2">
        <Label>Minimum Rating (optional)</Label>
        <Select
          value={(config.min_rating as string) || 'any'}
          onValueChange={(value) => onChange('min_rating', value === 'any' ? undefined : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Rating</SelectItem>
            <SelectItem value="5">5 Stars Only</SelectItem>
            <SelectItem value="4">4+ Stars</SelectItem>
            <SelectItem value="3">3+ Stars</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Only count reviews with this minimum rating
        </p>
      </div>
    </div>
  );
}

function AppointmentGoalConfig({ config, onChange }: GoalConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Appointment Type</Label>
        <Select
          value={(config.appointment_type as string) || 'any'}
          onValueChange={(value) =>
            onChange('appointment_type', value === 'any' ? undefined : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Any appointment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any Appointment</SelectItem>
            <SelectItem value="consultation">Consultation</SelectItem>
            <SelectItem value="policy_review">Policy Review</SelectItem>
            <SelectItem value="quote_review">Quote Review</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Require Attendance</p>
          <p className="text-xs text-muted-foreground">
            Only count as goal if appointment was attended (not just booked)
          </p>
        </div>
        <Switch
          checked={(config.require_attendance as boolean) || false}
          onCheckedChange={(checked) => onChange('require_attendance', checked)}
        />
      </div>
    </div>
  );
}
