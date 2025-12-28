/**
 * WorkflowTemplateSelector - Template Selection for New Workflows
 *
 * Displays available workflow templates for quick-start creation.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWorkflowTemplates } from '@/hooks/useAutomationWorkflows';
import {
  Cake,
  RefreshCw,
  UserPlus,
  Users,
  Star,
  Calendar,
  ShoppingCart,
  Heart,
  MessageCircle,
  FileText,
  Loader2,
} from 'lucide-react';

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  workflow_type: string;
  default_stages: unknown[];
  default_trigger_type: string;
  default_trigger_config: Record<string, unknown>;
  category: string;
}

interface WorkflowTemplateSelectorProps {
  onSelect: (template: WorkflowTemplate) => void;
  onStartBlank: () => void;
}

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  birthday: <Cake className="h-6 w-6" />,
  renewal: <RefreshCw className="h-6 w-6" />,
  welcome: <UserPlus className="h-6 w-6" />,
  referral: <Users className="h-6 w-6" />,
  review: <Star className="h-6 w-6" />,
  turning_65: <Calendar className="h-6 w-6" />,
  cross_sell: <ShoppingCart className="h-6 w-6" />,
  lost_deal: <Heart className="h-6 w-6" />,
  client_pulse: <MessageCircle className="h-6 w-6" />,
};

const TEMPLATE_COLORS: Record<string, string> = {
  birthday: 'bg-pink-500',
  renewal: 'bg-blue-500',
  welcome: 'bg-green-500',
  referral: 'bg-purple-500',
  review: 'bg-yellow-500',
  turning_65: 'bg-orange-500',
  cross_sell: 'bg-cyan-500',
  lost_deal: 'bg-red-500',
  client_pulse: 'bg-indigo-500',
};

export function WorkflowTemplateSelector({
  onSelect,
  onStartBlank,
}: WorkflowTemplateSelectorProps) {
  const { data: templates, isLoading } = useWorkflowTemplates();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group templates by category
  const templatesByCategory = (templates || []).reduce((acc, template) => {
    const category = template.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, WorkflowTemplate[]>);

  const categoryLabels: Record<string, string> = {
    engagement: 'Client Engagement',
    retention: 'Retention & Renewals',
    growth: 'Growth & Referrals',
    lifecycle: 'Lifecycle Marketing',
    other: 'Other Templates',
  };

  return (
    <div className="space-y-8">
      {/* Start Blank Option */}
      <Card
        className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
        onClick={onStartBlank}
      >
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">Start from Scratch</CardTitle>
              <CardDescription>
                Build a custom workflow from the ground up with full control
              </CardDescription>
            </div>
            <Button variant="outline">Select</Button>
          </div>
        </CardHeader>
      </Card>

      {/* Template Categories */}
      {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
        <div key={category} className="space-y-4">
          <h2 className="text-lg font-semibold">{categoryLabels[category] || category}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categoryTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => onSelect(template)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Show message if no templates */}
      {(!templates || templates.length === 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recommended Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEFAULT_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => onSelect(template)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: WorkflowTemplate;
  onSelect: () => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const icon = TEMPLATE_ICONS[template.workflow_type] || <FileText className="h-6 w-6" />;
  const bgColor = TEMPLATE_COLORS[template.workflow_type] || 'bg-gray-500';
  const stageCount = Array.isArray(template.default_stages)
    ? template.default_stages.length
    : 0;

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-lg ${bgColor} flex items-center justify-center text-white flex-shrink-0`}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {template.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {getTriggerLabel(template.default_trigger_type)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function getTriggerLabel(triggerType: string): string {
  const labels: Record<string, string> = {
    manual: 'Manual',
    event: 'Event',
    date_field: 'Date-based',
    status_change: 'Status',
    form_submit: 'Form',
    api: 'API',
  };
  return labels[triggerType] || triggerType;
}

// Default templates for when database is empty
const DEFAULT_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'default-birthday',
    name: 'Birthday Greetings',
    description: 'Send personalized birthday wishes to clients with a special offer',
    workflow_type: 'birthday',
    category: 'engagement',
    default_trigger_type: 'date_field',
    default_trigger_config: { date_field: 'date_of_birth', timing: 'on', recurrence: 'yearly' },
    default_stages: [
      {
        name: 'Birthday Email',
        action_type: 'send_email',
        action_config: { template_category: 'birthday' },
        delay_value: 0,
        delay_unit: 'days',
      },
    ],
  },
  {
    id: 'default-renewal',
    name: 'Renewal Reminder Sequence',
    description: 'Multi-touch renewal reminder campaign starting 60 days before expiration',
    workflow_type: 'renewal',
    category: 'retention',
    default_trigger_type: 'date_field',
    default_trigger_config: { date_field: 'policy_expiration', days_offset: 60, timing: 'before' },
    default_stages: [
      {
        name: '60-Day Reminder',
        action_type: 'send_email',
        action_config: {},
        delay_value: 0,
        delay_unit: 'days',
      },
      {
        name: '30-Day Reminder',
        action_type: 'send_email',
        action_config: {},
        delay_value: 30,
        delay_unit: 'days',
      },
      {
        name: 'Agent Follow-up Task',
        action_type: 'create_task',
        action_config: { title: 'Call about renewal', priority: 'high' },
        delay_value: 7,
        delay_unit: 'days',
      },
      {
        name: 'Final Reminder',
        action_type: 'send_email',
        action_config: {},
        delay_value: 7,
        delay_unit: 'days',
      },
    ],
  },
  {
    id: 'default-welcome',
    name: 'New Customer Welcome',
    description: 'Welcome new customers and introduce them to your agency services',
    workflow_type: 'welcome',
    category: 'lifecycle',
    default_trigger_type: 'event',
    default_trigger_config: { event_type: 'customer_created' },
    default_stages: [
      {
        name: 'Welcome Email',
        action_type: 'send_email',
        action_config: {},
        delay_value: 0,
        delay_unit: 'days',
      },
      {
        name: 'Introduction to Services',
        action_type: 'send_email',
        action_config: {},
        delay_value: 3,
        delay_unit: 'days',
      },
      {
        name: 'Check-in Call Task',
        action_type: 'create_task',
        action_config: { title: 'Welcome call to new customer', priority: 'medium' },
        delay_value: 7,
        delay_unit: 'days',
      },
    ],
  },
  {
    id: 'default-referral',
    name: 'Referral Request',
    description: 'Request referrals from satisfied customers after policy purchase',
    workflow_type: 'referral',
    category: 'growth',
    default_trigger_type: 'event',
    default_trigger_config: { event_type: 'policy_created' },
    default_stages: [
      {
        name: 'Thank You Email',
        action_type: 'send_email',
        action_config: {},
        delay_value: 1,
        delay_unit: 'days',
      },
      {
        name: 'Referral Request Email',
        action_type: 'send_email',
        action_config: {},
        delay_value: 14,
        delay_unit: 'days',
      },
      {
        name: 'Referral Reminder',
        action_type: 'send_email',
        action_config: {},
        delay_value: 30,
        delay_unit: 'days',
      },
    ],
  },
  {
    id: 'default-review',
    name: 'Google Review Request',
    description: 'Request Google reviews from happy customers',
    workflow_type: 'review',
    category: 'growth',
    default_trigger_type: 'manual',
    default_trigger_config: {},
    default_stages: [
      {
        name: 'Review Request Email',
        action_type: 'send_email',
        action_config: {},
        delay_value: 0,
        delay_unit: 'days',
      },
      {
        name: 'Review Reminder SMS',
        action_type: 'send_sms',
        action_config: {},
        delay_value: 3,
        delay_unit: 'days',
      },
    ],
  },
  {
    id: 'default-turning-65',
    name: 'Turning 65 Medicare',
    description: 'Medicare education campaign for contacts approaching 65',
    workflow_type: 'turning_65',
    category: 'lifecycle',
    default_trigger_type: 'date_field',
    default_trigger_config: { date_field: 'date_of_birth', days_offset: 180, timing: 'before' },
    default_stages: [
      {
        name: 'Medicare Introduction',
        action_type: 'send_email',
        action_config: {},
        delay_value: 0,
        delay_unit: 'days',
      },
      {
        name: 'Medicare Options Email',
        action_type: 'send_email',
        action_config: {},
        delay_value: 30,
        delay_unit: 'days',
      },
      {
        name: 'Schedule Consultation Task',
        action_type: 'create_task',
        action_config: { title: 'Schedule Medicare consultation', priority: 'high' },
        delay_value: 30,
        delay_unit: 'days',
      },
      {
        name: 'Enrollment Reminder',
        action_type: 'send_email',
        action_config: {},
        delay_value: 30,
        delay_unit: 'days',
      },
    ],
  },
];
