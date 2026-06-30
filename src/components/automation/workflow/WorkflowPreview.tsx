/**
 * WorkflowPreview - Visual Workflow Preview Panel
 *
 * Shows a visual representation of the workflow timeline.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  MessageSquare,
  CheckSquare,
  Webhook,
  Clock,
  Zap,
  Target,
  ArrowDown,
  Edit,
  Users,
  RefreshCw,
  Calendar,
  UserPlus,
  FileText,
  Tag,
  Globe,
  MousePointerClick,
} from 'lucide-react';

interface WorkflowStage {
  ui_id: string;
  name: string;
  action_type: string;
  action_config: Record<string, unknown>;
  delay_value: number;
  delay_unit: string;
  conditions: Record<string, unknown> | null;
}

interface WorkflowPreviewProps {
  name: string;
  description: string;
  workflowType: string;
  triggerType: string;
  stages: WorkflowStage[];
  goalType: string | null;
}

export function WorkflowPreview({
  name,
  description,
  workflowType,
  triggerType,
  stages,
  goalType,
}: WorkflowPreviewProps) {
  return (
    <Card className="sticky top-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Workflow Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Workflow Info */}
        <div>
          <h3 className="font-semibold truncate">{name || 'Untitled Workflow'}</h3>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{getWorkflowTypeLabel(workflowType)}</Badge>
          </div>
        </div>

        <Separator />

        {/* Visual Timeline */}
        <div className="space-y-0">
          {/* Trigger */}
          <TimelineNode
            icon={getTriggerIcon(triggerType)}
            label={getTriggerLabel(triggerType)}
            type="trigger"
            isFirst
          />

          {/* Stages */}
          {stages.map((stage, index) => (
            <div key={stage.ui_id}>
              {/* Delay indicator */}
              {stage.delay_value > 0 && (
                <TimelineConnector delay={`${stage.delay_value} ${stage.delay_unit}`} />
              )}
              {stage.delay_value === 0 && <TimelineConnector delay="Immediately" />}

              {/* Stage */}
              <TimelineNode
                icon={getActionIcon(stage.action_type)}
                label={stage.name || getActionLabel(stage.action_type)}
                type="action"
                hasConditions={!!stage.conditions}
              />
            </div>
          ))}

          {/* Goal (if set) */}
          {goalType && (
            <>
              <TimelineConnector isGoal />
              <TimelineNode
                icon={<Target className="h-4 w-4" />}
                label={getGoalLabel(goalType)}
                type="goal"
                isLast
              />
            </>
          )}

          {/* End marker if no goal */}
          {!goalType && stages.length > 0 && (
            <>
              <TimelineConnector isEnd />
              <TimelineNode
                icon={<CheckSquare className="h-4 w-4" />}
                label="Workflow Complete"
                type="end"
                isLast
              />
            </>
          )}
        </div>

        {/* Stats */}
        {stages.length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Stages</p>
                <p className="font-semibold">{stages.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Duration</p>
                <p className="font-semibold">{calculateTotalDuration(stages)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Emails</p>
                <p className="font-semibold">
                  {stages.filter((s) => s.action_type === 'send_email').length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">SMS</p>
                <p className="font-semibold">
                  {stages.filter((s) => s.action_type === 'send_sms').length}
                </p>
              </div>
            </div>
          </>
        )}

        {stages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Add stages to see the workflow preview</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Timeline Components
// ============================================================================

interface TimelineNodeProps {
  icon: React.ReactNode;
  label: string;
  type: 'trigger' | 'action' | 'goal' | 'end';
  isFirst?: boolean;
  isLast?: boolean;
  hasConditions?: boolean;
}

function TimelineNode({ icon, label, type, isFirst, isLast, hasConditions }: TimelineNodeProps) {
  const bgColors = {
    trigger: 'bg-info',
    action: 'bg-primary',
    goal: 'bg-success',
    end: 'bg-cc-text-muted',
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        {/* Connector line above */}
        {!isFirst && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0.5 h-2 bg-border" />
        )}

        {/* Node */}
        <div
          className={`w-8 h-8 rounded-full ${bgColors[type]} flex items-center justify-center text-white`}
        >
          {icon}
        </div>

        {/* Connector line below */}
        {!isLast && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0.5 h-2 bg-border" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{label}</p>
        {hasConditions && (
          <p className="text-xs text-muted-foreground">Conditional</p>
        )}
      </div>
    </div>
  );
}

interface TimelineConnectorProps {
  delay?: string;
  isGoal?: boolean;
  isEnd?: boolean;
}

function TimelineConnector({ delay, isGoal, isEnd }: TimelineConnectorProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 flex justify-center">
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-4 bg-border" />
          {!isEnd && (
            <div className="w-4 h-4 flex items-center justify-center">
              {isGoal ? (
                <Target className="h-3 w-3 text-success" />
              ) : (
                <Clock className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          )}
          <div className="w-0.5 h-4 bg-border" />
        </div>
      </div>
      {delay && (
        <span className="text-xs text-muted-foreground">{delay}</span>
      )}
    </div>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTriggerIcon(triggerType: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    manual: <MousePointerClick className="h-4 w-4" />,
    event: <Zap className="h-4 w-4" />,
    date_field: <Calendar className="h-4 w-4" />,
    status_change: <Tag className="h-4 w-4" />,
    form_submit: <FileText className="h-4 w-4" />,
    api: <Globe className="h-4 w-4" />,
  };
  return icons[triggerType] || <Zap className="h-4 w-4" />;
}

function getTriggerLabel(triggerType: string): string {
  const labels: Record<string, string> = {
    manual: 'Manual Enrollment',
    event: 'Event Trigger',
    date_field: 'Date-Based Trigger',
    status_change: 'Status Change',
    form_submit: 'Form Submission',
    api: 'API Trigger',
  };
  return labels[triggerType] || 'Trigger';
}

function getActionIcon(actionType: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    send_email: <Mail className="h-4 w-4" />,
    send_sms: <MessageSquare className="h-4 w-4" />,
    create_task: <CheckSquare className="h-4 w-4" />,
    webhook: <Webhook className="h-4 w-4" />,
    wait: <Clock className="h-4 w-4" />,
    update_field: <Edit className="h-4 w-4" />,
    add_tag: <Users className="h-4 w-4" />,
    remove_tag: <Users className="h-4 w-4" />,
    enroll_workflow: <RefreshCw className="h-4 w-4" />,
  };
  return icons[actionType] || <CheckSquare className="h-4 w-4" />;
}

function getActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    send_email: 'Send Email',
    send_sms: 'Send SMS',
    create_task: 'Create Task',
    webhook: 'Call Webhook',
    wait: 'Wait/Delay',
    update_field: 'Update Field',
    add_tag: 'Add Tag',
    remove_tag: 'Remove Tag',
    enroll_workflow: 'Enroll in Workflow',
  };
  return labels[actionType] || actionType;
}

function getGoalLabel(goalType: string): string {
  const labels: Record<string, string> = {
    conversion: 'Goal: Lead Conversion',
    purchase: 'Goal: Policy Purchase',
    reply: 'Goal: Email Reply',
    click: 'Goal: Link Click',
    form_submit: 'Goal: Form Submission',
    review: 'Goal: Leave Review',
    appointment: 'Goal: Book Appointment',
  };
  return labels[goalType] || `Goal: ${goalType}`;
}

function getWorkflowTypeLabel(workflowType: string): string {
  const labels: Record<string, string> = {
    custom: 'Custom',
    birthday: 'Birthday',
    renewal: 'Renewal',
    welcome: 'Welcome',
    referral: 'Referral',
    review: 'Review Request',
    turning_65: 'Turning 65',
    cross_sell: 'Cross-sell',
    lost_deal: 'Lost Deal',
    client_pulse: 'Client Pulse',
  };
  return labels[workflowType] || workflowType;
}

function calculateTotalDuration(stages: WorkflowStage[]): string {
  // Convert all delays to days for simplicity
  const totalDays = stages.reduce((total, stage) => {
    const value = stage.delay_value || 0;
    const multipliers: Record<string, number> = {
      minutes: 1 / 1440,
      hours: 1 / 24,
      days: 1,
      weeks: 7,
    };
    return total + value * (multipliers[stage.delay_unit] || 1);
  }, 0);

  if (totalDays === 0) return 'Instant';
  if (totalDays < 1) return `${Math.round(totalDays * 24)} hours`;
  if (totalDays === 1) return '1 day';
  if (totalDays < 7) return `${Math.round(totalDays)} days`;
  if (totalDays === 7) return '1 week';
  if (totalDays < 30) return `${Math.round(totalDays / 7)} weeks`;
  return `${Math.round(totalDays / 30)} months`;
}
