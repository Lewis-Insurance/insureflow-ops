/**
 * WorkflowStageModal - Stage Configuration Dialog
 *
 * Modal for creating and editing workflow stages with action configuration.
 */

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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useEmailTemplates } from '@/hooks/useTemplates';
import { useSMSTemplates } from '@/hooks/useTemplates';
import { Mail, MessageSquare, CheckSquare, Webhook, Clock, Edit, Users } from 'lucide-react';

interface WorkflowStage {
  ui_id: string;
  id: string;
  workflow_id: string;
  name: string;
  stage_order: number;
  action_type: string;
  action_config: Record<string, unknown>;
  delay_value: number;
  delay_unit: string;
  conditions: Record<string, unknown> | null;
  exit_conditions: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowStageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: WorkflowStage | null;
  onSave: (stage: WorkflowStage) => void;
}

const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email', icon: Mail, color: 'text-blue-500' },
  { value: 'send_sms', label: 'Send SMS', icon: MessageSquare, color: 'text-green-500' },
  { value: 'create_task', label: 'Create Task', icon: CheckSquare, color: 'text-purple-500' },
  { value: 'webhook', label: 'Call Webhook', icon: Webhook, color: 'text-orange-500' },
  { value: 'wait', label: 'Wait/Delay Only', icon: Clock, color: 'text-gray-500' },
  { value: 'update_field', label: 'Update Field', icon: Edit, color: 'text-yellow-500' },
  { value: 'add_tag', label: 'Add Tag', icon: Users, color: 'text-pink-500' },
  { value: 'remove_tag', label: 'Remove Tag', icon: Users, color: 'text-red-500' },
];

const DELAY_UNITS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
];

export function WorkflowStageModal({ open, onOpenChange, stage, onSave }: WorkflowStageModalProps) {
  // Form state
  const [name, setName] = useState('');
  const [actionType, setActionType] = useState('send_email');
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>({});
  const [delayValue, setDelayValue] = useState(0);
  const [delayUnit, setDelayUnit] = useState('days');
  const [hasConditions, setHasConditions] = useState(false);
  const [conditions, setConditions] = useState<Record<string, unknown>>({});

  // Template data
  const { data: emailTemplates } = useEmailTemplates({ status: 'active' });
  const { data: smsTemplates } = useSMSTemplates({ status: 'active' });

  // Load stage data when editing
  useEffect(() => {
    if (stage) {
      setName(stage.name || '');
      setActionType(stage.action_type || 'send_email');
      setActionConfig(stage.action_config || {});
      setDelayValue(stage.delay_value || 0);
      setDelayUnit(stage.delay_unit || 'days');
      setHasConditions(!!stage.conditions);
      setConditions(stage.conditions || {});
    } else {
      // Reset form for new stage
      setName('');
      setActionType('send_email');
      setActionConfig({});
      setDelayValue(0);
      setDelayUnit('days');
      setHasConditions(false);
      setConditions({});
    }
  }, [stage, open]);

  const handleSave = () => {
    if (!stage) return;

    const updatedStage: WorkflowStage = {
      ...stage,
      name: name || getDefaultStageName(actionType),
      action_type: actionType,
      action_config: actionConfig,
      delay_value: delayValue,
      delay_unit: delayUnit,
      conditions: hasConditions ? conditions : null,
    };

    onSave(updatedStage);
  };

  const getDefaultStageName = (type: string): string => {
    const actionConfig = ACTION_TYPES.find((a) => a.value === type);
    return actionConfig?.label || type;
  };

  const updateActionConfig = (key: string, value: unknown) => {
    setActionConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stage?.id ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
          <DialogDescription>
            Configure the action and timing for this workflow stage
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="action" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="action">Action</TabsTrigger>
            <TabsTrigger value="timing">Timing</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
          </TabsList>

          {/* Action Tab */}
          <TabsContent value="action" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Stage Name</Label>
              <Input
                id="name"
                placeholder="e.g., Welcome Email"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Give this stage a descriptive name for easy identification
              </p>
            </div>

            <div className="space-y-2">
              <Label>Action Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {ACTION_TYPES.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.value}
                      type="button"
                      variant={actionType === action.value ? 'default' : 'outline'}
                      className="justify-start h-auto py-3"
                      onClick={() => {
                        setActionType(action.value);
                        setActionConfig({});
                      }}
                    >
                      <Icon className={`h-4 w-4 mr-2 ${action.color}`} />
                      {action.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Action-specific configuration */}
            <div className="space-y-4 pt-4 border-t">
              {actionType === 'send_email' && (
                <EmailActionConfig
                  config={actionConfig}
                  templates={emailTemplates || []}
                  onChange={updateActionConfig}
                />
              )}

              {actionType === 'send_sms' && (
                <SMSActionConfig
                  config={actionConfig}
                  templates={smsTemplates || []}
                  onChange={updateActionConfig}
                />
              )}

              {actionType === 'create_task' && (
                <TaskActionConfig config={actionConfig} onChange={updateActionConfig} />
              )}

              {actionType === 'webhook' && (
                <WebhookActionConfig config={actionConfig} onChange={updateActionConfig} />
              )}

              {actionType === 'update_field' && (
                <UpdateFieldConfig config={actionConfig} onChange={updateActionConfig} />
              )}

              {(actionType === 'add_tag' || actionType === 'remove_tag') && (
                <TagActionConfig config={actionConfig} onChange={updateActionConfig} />
              )}

              {actionType === 'wait' && (
                <p className="text-sm text-muted-foreground">
                  This stage only adds a delay before the next stage. Configure the timing in
                  the Timing tab.
                </p>
              )}
            </div>
          </TabsContent>

          {/* Timing Tab */}
          <TabsContent value="timing" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Delay Before This Stage</Label>
              <p className="text-sm text-muted-foreground">
                How long to wait after the previous stage (or trigger) before executing this action
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="delayValue">Wait Time</Label>
                <Input
                  id="delayValue"
                  type="number"
                  min="0"
                  value={delayValue}
                  onChange={(e) => setDelayValue(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="delayUnit">Unit</Label>
                <Select value={delayUnit} onValueChange={setDelayUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELAY_UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {delayValue === 0 && (
              <p className="text-sm text-green-600">
                This action will execute immediately after the trigger/previous stage.
              </p>
            )}

            <div className="space-y-2 pt-4 border-t">
              <Label>Timing Options</Label>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Skip Weekends</p>
                    <p className="text-xs text-muted-foreground">
                      Delay execution until next business day if it falls on a weekend
                    </p>
                  </div>
                  <Switch
                    checked={(actionConfig.skip_weekends as boolean) || false}
                    onCheckedChange={(checked) => updateActionConfig('skip_weekends', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Business Hours Only</p>
                    <p className="text-xs text-muted-foreground">
                      Only execute during 9 AM - 5 PM in contact's timezone
                    </p>
                  </div>
                  <Switch
                    checked={(actionConfig.business_hours_only as boolean) || false}
                    onCheckedChange={(checked) =>
                      updateActionConfig('business_hours_only', checked)
                    }
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Conditions Tab */}
          <TabsContent value="conditions" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Stage Conditions</Label>
                <p className="text-sm text-muted-foreground">
                  Only execute this stage if specific conditions are met
                </p>
              </div>
              <Switch checked={hasConditions} onCheckedChange={setHasConditions} />
            </div>

            {hasConditions && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Email Engagement</Label>
                  <Select
                    value={(conditions.email_engagement as string) || 'any'}
                    onValueChange={(value) =>
                      setConditions((prev) => ({
                        ...prev,
                        email_engagement: value === 'any' ? undefined : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any engagement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any (no filter)</SelectItem>
                      <SelectItem value="opened">Opened previous email</SelectItem>
                      <SelectItem value="not_opened">Did NOT open previous email</SelectItem>
                      <SelectItem value="clicked">Clicked link in previous email</SelectItem>
                      <SelectItem value="not_clicked">Did NOT click previous email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Contact Status</Label>
                  <Select
                    value={(conditions.contact_status as string) || 'any'}
                    onValueChange={(value) =>
                      setConditions((prev) => ({
                        ...prev,
                        contact_status: value === 'any' ? undefined : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any status</SelectItem>
                      <SelectItem value="still_lead">Still a lead (not converted)</SelectItem>
                      <SelectItem value="converted">Converted to customer</SelectItem>
                      <SelectItem value="unsubscribed">Not unsubscribed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Goal Progress</Label>
                  <Select
                    value={(conditions.goal_progress as string) || 'any'}
                    onValueChange={(value) =>
                      setConditions((prev) => ({
                        ...prev,
                        goal_progress: value === 'any' ? undefined : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any (ignore goal)</SelectItem>
                      <SelectItem value="not_achieved">Goal NOT yet achieved</SelectItem>
                      <SelectItem value="achieved">Goal achieved (stop workflow)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {stage?.id ? 'Update Stage' : 'Add Stage'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Action Configuration Components
// ============================================================================

interface ActionConfigProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function EmailActionConfig({
  config,
  templates,
  onChange,
}: ActionConfigProps & { templates: Array<{ id: string; name: string; subject: string }> }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Email Template</Label>
        <Select
          value={(config.template_id as string) || ''}
          onValueChange={(value) => onChange('template_id', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                <div className="flex flex-col">
                  <span>{template.name}</span>
                  <span className="text-xs text-muted-foreground">{template.subject}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Subject Line Override (optional)</Label>
        <Input
          placeholder="Leave blank to use template subject"
          value={(config.subject_override as string) || ''}
          onChange={(e) => onChange('subject_override', e.target.value || undefined)}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Track Opens</p>
          <p className="text-xs text-muted-foreground">Enable open tracking for this email</p>
        </div>
        <Switch
          checked={(config.track_opens as boolean) !== false}
          onCheckedChange={(checked) => onChange('track_opens', checked)}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Track Clicks</p>
          <p className="text-xs text-muted-foreground">Enable click tracking for links</p>
        </div>
        <Switch
          checked={(config.track_clicks as boolean) !== false}
          onCheckedChange={(checked) => onChange('track_clicks', checked)}
        />
      </div>
    </div>
  );
}

function SMSActionConfig({
  config,
  templates,
  onChange,
}: ActionConfigProps & { templates: Array<{ id: string; name: string; message: string }> }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>SMS Template</Label>
        <Select
          value={(config.template_id as string) || ''}
          onValueChange={(value) => onChange('template_id', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                <div className="flex flex-col">
                  <span>{template.name}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                    {template.message}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Custom Message (instead of template)</Label>
        <Textarea
          placeholder="Enter a custom message or leave blank to use template"
          value={(config.custom_message as string) || ''}
          onChange={(e) => onChange('custom_message', e.target.value || undefined)}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Use merge tags like {'{{first_name}}'} for personalization
        </p>
      </div>
    </div>
  );
}

function TaskActionConfig({ config, onChange }: ActionConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Task Title</Label>
        <Input
          placeholder="e.g., Follow up with {{first_name}}"
          value={(config.title as string) || ''}
          onChange={(e) => onChange('title', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Task Description</Label>
        <Textarea
          placeholder="Describe what needs to be done..."
          value={(config.description as string) || ''}
          onChange={(e) => onChange('description', e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Priority</Label>
        <Select
          value={(config.priority as string) || 'medium'}
          onValueChange={(value) => onChange('priority', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Due In</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min="1"
            value={(config.due_in_value as number) || 1}
            onChange={(e) => onChange('due_in_value', parseInt(e.target.value) || 1)}
            className="w-24"
          />
          <Select
            value={(config.due_in_unit as string) || 'days'}
            onValueChange={(value) => onChange('due_in_unit', value)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="weeks">Weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Assign To</Label>
        <Select
          value={(config.assign_to as string) || 'owner'}
          onValueChange={(value) => onChange('assign_to', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Account Owner</SelectItem>
            <SelectItem value="creator">Workflow Creator</SelectItem>
            <SelectItem value="round_robin">Round Robin (Team)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function WebhookActionConfig({ config, onChange }: ActionConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Webhook URL</Label>
        <Input
          type="url"
          placeholder="https://example.com/webhook"
          value={(config.url as string) || ''}
          onChange={(e) => onChange('url', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>HTTP Method</Label>
        <Select
          value={(config.method as string) || 'POST'}
          onValueChange={(value) => onChange('method', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Custom Headers (JSON)</Label>
        <Textarea
          placeholder='{"Authorization": "Bearer token"}'
          value={(config.headers as string) || ''}
          onChange={(e) => onChange('headers', e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Include Contact Data</Label>
        <div className="flex items-center gap-2">
          <Switch
            checked={(config.include_contact_data as boolean) !== false}
            onCheckedChange={(checked) => onChange('include_contact_data', checked)}
          />
          <span className="text-sm text-muted-foreground">
            Send contact information in the request body
          </span>
        </div>
      </div>
    </div>
  );
}

function UpdateFieldConfig({ config, onChange }: ActionConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Field to Update</Label>
        <Select
          value={(config.field as string) || ''}
          onValueChange={(value) => onChange('field', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a field" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">Lead/Contact Status</SelectItem>
            <SelectItem value="lead_score">Lead Score</SelectItem>
            <SelectItem value="custom_field_1">Custom Field 1</SelectItem>
            <SelectItem value="custom_field_2">Custom Field 2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>New Value</Label>
        <Input
          placeholder="Enter the new value"
          value={(config.value as string) || ''}
          onChange={(e) => onChange('value', e.target.value)}
        />
      </div>
    </div>
  );
}

function TagActionConfig({ config, onChange }: ActionConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tag Name</Label>
        <Input
          placeholder="e.g., Nurture Sequence Completed"
          value={(config.tag as string) || ''}
          onChange={(e) => onChange('tag', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Enter the tag to add or remove from the contact
        </p>
      </div>
    </div>
  );
}
