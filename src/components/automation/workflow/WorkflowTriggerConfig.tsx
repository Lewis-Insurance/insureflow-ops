/**
 * WorkflowTriggerConfig - Trigger Configuration Panel
 *
 * Configures when and how workflows are triggered.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TriggerType } from '@/hooks/useAutomationWorkflows';
import {
  Zap,
  Calendar,
  UserPlus,
  FileText,
  Tag,
  Clock,
  MousePointerClick,
  Globe,
} from 'lucide-react';

interface WorkflowTriggerConfigProps {
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  onTriggerTypeChange: (type: TriggerType) => void;
  onTriggerConfigChange: (config: Record<string, unknown>) => void;
}

const TRIGGER_TYPES = [
  {
    value: 'manual',
    label: 'Manual Enrollment',
    description: 'Manually enroll contacts into this workflow',
    icon: MousePointerClick,
  },
  {
    value: 'event',
    label: 'Event-Based',
    description: 'Trigger when specific events occur',
    icon: Zap,
  },
  {
    value: 'date_field',
    label: 'Date-Based',
    description: 'Trigger based on dates (birthdays, renewals)',
    icon: Calendar,
  },
  {
    value: 'status_change',
    label: 'Status Change',
    description: 'Trigger when lead/customer status changes',
    icon: Tag,
  },
  {
    value: 'form_submit',
    label: 'Form Submission',
    description: 'Trigger when a form is submitted',
    icon: FileText,
  },
  {
    value: 'api',
    label: 'API/Webhook',
    description: 'Trigger via external API call',
    icon: Globe,
  },
];

const EVENT_TYPES = [
  { value: 'lead_created', label: 'New Lead Created' },
  { value: 'customer_created', label: 'New Customer Created' },
  { value: 'policy_created', label: 'New Policy Created' },
  { value: 'policy_renewed', label: 'Policy Renewed' },
  { value: 'quote_sent', label: 'Quote Sent' },
  { value: 'quote_accepted', label: 'Quote Accepted' },
  { value: 'quote_declined', label: 'Quote Declined' },
  { value: 'document_uploaded', label: 'Document Uploaded' },
  { value: 'email_opened', label: 'Email Opened' },
  { value: 'email_clicked', label: 'Email Link Clicked' },
  { value: 'task_completed', label: 'Task Completed' },
];

const DATE_FIELDS = [
  { value: 'date_of_birth', label: 'Date of Birth (Birthday)' },
  { value: 'policy_expiration', label: 'Policy Expiration Date' },
  { value: 'policy_effective', label: 'Policy Effective Date' },
  { value: 'created_at', label: 'Account Created Date' },
  { value: 'last_contact', label: 'Last Contact Date' },
  { value: 'custom_date', label: 'Custom Date Field' },
];

const STATUS_CHANGES = [
  { value: 'lead_to_customer', label: 'Lead Converted to Customer' },
  { value: 'lead_lost', label: 'Lead Marked as Lost' },
  { value: 'customer_churned', label: 'Customer Churned' },
  { value: 'lead_qualified', label: 'Lead Qualified' },
  { value: 'policy_cancelled', label: 'Policy Cancelled' },
];

export function WorkflowTriggerConfig({
  triggerType,
  triggerConfig,
  onTriggerTypeChange,
  onTriggerConfigChange,
}: WorkflowTriggerConfigProps) {
  const updateConfig = (key: string, value: unknown) => {
    onTriggerConfigChange({ ...triggerConfig, [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Trigger</CardTitle>
        <CardDescription>
          Define when contacts should be enrolled in this workflow
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trigger Type Selection */}
        <div className="space-y-4">
          <Label>Trigger Type</Label>
          <RadioGroup
            value={triggerType}
            onValueChange={(value) => {
              onTriggerTypeChange(value as TriggerType);
              onTriggerConfigChange({}); // Reset config when changing type
            }}
            className="grid grid-cols-2 gap-4"
          >
            {TRIGGER_TYPES.map((trigger) => {
              const Icon = trigger.icon;
              return (
                <Label
                  key={trigger.value}
                  htmlFor={trigger.value}
                  className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                    triggerType === trigger.value
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={trigger.value} id={trigger.value} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-medium">{trigger.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
        </div>

        {/* Trigger-specific Configuration */}
        <div className="pt-6 border-t">
          {triggerType === 'manual' && <ManualTriggerConfig />}

          {triggerType === 'event' && (
            <EventTriggerConfig config={triggerConfig} onChange={updateConfig} />
          )}

          {triggerType === 'date_field' && (
            <DateTriggerConfig config={triggerConfig} onChange={updateConfig} />
          )}

          {triggerType === 'status_change' && (
            <StatusChangeTriggerConfig config={triggerConfig} onChange={updateConfig} />
          )}

          {triggerType === 'form_submit' && (
            <FormSubmitTriggerConfig config={triggerConfig} onChange={updateConfig} />
          )}

          {triggerType === 'api' && <APITriggerConfig config={triggerConfig} />}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Trigger Configuration Components
// ============================================================================

function ManualTriggerConfig() {
  return (
    <div className="space-y-2">
      <h4 className="font-medium">Manual Enrollment</h4>
      <p className="text-sm text-muted-foreground">
        Contacts will be enrolled manually from the CRM or via bulk actions. This is useful for
        one-time campaigns or targeted outreach.
      </p>
      <ul className="text-sm text-muted-foreground list-disc list-inside mt-4 space-y-1">
        <li>Enroll individual contacts from their profile</li>
        <li>Bulk enroll from a filtered list</li>
        <li>Enroll via API for custom integrations</li>
      </ul>
    </div>
  );
}

interface TriggerConfigProps {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

function EventTriggerConfig({ config, onChange }: TriggerConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Event Type</Label>
        <Select
          value={(config.event_type as string) || ''}
          onValueChange={(value) => onChange('event_type', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an event" />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((event) => (
              <SelectItem key={event.value} value={event.value}>
                {event.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.event_type === 'policy_created' && (
        <div className="space-y-2">
          <Label>Policy Type Filter</Label>
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
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        The workflow will trigger automatically when this event occurs for any contact that
        matches the enrollment filters.
      </p>
    </div>
  );
}

function DateTriggerConfig({ config, onChange }: TriggerConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Date Field</Label>
        <Select
          value={(config.date_field as string) || ''}
          onValueChange={(value) => onChange('date_field', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a date field" />
          </SelectTrigger>
          <SelectContent>
            {DATE_FIELDS.map((field) => (
              <SelectItem key={field.value} value={field.value}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Trigger Timing</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            value={(config.days_offset as number) || 0}
            onChange={(e) => onChange('days_offset', parseInt(e.target.value) || 0)}
            className="w-24"
          />
          <Select
            value={(config.timing as string) || 'before'}
            onValueChange={(value) => onChange('timing', value)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="before">days before</SelectItem>
              <SelectItem value="after">days after</SelectItem>
              <SelectItem value="on">on the date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Example: "30 days before" policy expiration for renewal reminders
        </p>
      </div>

      <div className="space-y-2">
        <Label>Recurrence</Label>
        <Select
          value={(config.recurrence as string) || 'once'}
          onValueChange={(value) => onChange('recurrence', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">One-time only</SelectItem>
            <SelectItem value="yearly">Every year (for birthdays)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function StatusChangeTriggerConfig({ config, onChange }: TriggerConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Status Change Type</Label>
        <Select
          value={(config.status_change as string) || ''}
          onValueChange={(value) => onChange('status_change', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a status change" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_CHANGES.map((change) => (
              <SelectItem key={change.value} value={change.value}>
                {change.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground">
        The workflow will trigger when a contact's status changes to match the selected
        condition.
      </p>
    </div>
  );
}

function FormSubmitTriggerConfig({ config, onChange }: TriggerConfigProps) {
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
            <SelectItem value="contact_form">Contact Form</SelectItem>
            <SelectItem value="quote_request">Quote Request</SelectItem>
            <SelectItem value="intake_form">Intake Form</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground">
        The workflow will trigger when the selected form is submitted by a new or existing
        contact.
      </p>
    </div>
  );
}

function APITriggerConfig({ config }: { config: Record<string, unknown> }) {
  const webhookUrl = `${window.location.origin}/api/workflows/trigger`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>API Endpoint</Label>
        <div className="flex gap-2">
          <Input value={webhookUrl} readOnly className="font-mono text-sm" />
          <button
            type="button"
            className="px-3 py-2 text-sm border rounded-md hover:bg-muted"
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
          >
            Copy
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>API Key</Label>
        <Input
          type="password"
          value="••••••••••••••••"
          readOnly
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Include this key in the X-API-Key header
        </p>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm font-medium mb-2">Example Request:</p>
        <pre className="text-xs overflow-x-auto">
          {`POST ${webhookUrl}
Content-Type: application/json
X-API-Key: your-api-key

{
  "workflow_id": "<workflow-id>",
  "contact_id": "<contact-uuid>",
  "metadata": { ... }
}`}
        </pre>
      </div>
    </div>
  );
}
