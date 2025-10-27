import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useCreateAutomationAction,
  useUpdateAutomationAction,
  type AutomationAction,
} from '@/integrations/supabase/hooks/useAutomationRules';

interface ActionConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
  action: AutomationAction | null;
  nextOrder: number;
}

export function ActionConfigModal({
  open,
  onOpenChange,
  ruleId,
  action,
  nextOrder,
}: ActionConfigModalProps) {
  const createAction = useCreateAutomationAction();
  const updateAction = useUpdateAutomationAction();

  const [actionType, setActionType] = useState('send_email');
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [config, setConfig] = useState<any>({});

  useEffect(() => {
    if (action) {
      setActionType(action.action_type);
      setDelayMinutes(action.delay_minutes);
      setConfig(action.action_config || {});
    } else {
      setActionType('send_email');
      setDelayMinutes(0);
      setConfig({});
    }
  }, [action, open]);

  const handleSave = async () => {
    const actionData = {
      rule_id: ruleId,
      action_type: actionType,
      action_order: action ? action.action_order : nextOrder,
      action_config: config,
      delay_minutes: delayMinutes,
      conditions: {},
      is_active: true,
    };

    if (action) {
      await updateAction.mutateAsync({ id: action.id, updates: actionData });
    } else {
      await createAction.mutateAsync(actionData);
    }

    onOpenChange(false);
  };

  const renderConfigForm = () => {
    switch (actionType) {
      case 'send_email':
        return (
          <>
            <div className="space-y-2">
              <Label>From Name</Label>
              <Input
                placeholder="Your Company Name"
                value={config.from_name || ''}
                onChange={(e) => setConfig({ ...config, from_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject"
                value={config.subject || ''}
                onChange={(e) => setConfig({ ...config, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Body</Label>
              <Textarea
                placeholder="Email content... You can use variables like {{lead.first_name}}, {{lead.email}}, etc."
                value={config.body || ''}
                onChange={(e) => setConfig({ ...config, body: e.target.value })}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                Use &#123;&#123;variable&#125;&#125; for dynamic values
              </p>
            </div>
          </>
        );
      
      case 'send_sms':
        return (
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="SMS message content"
              value={config.message || ''}
              onChange={(e) => setConfig({ ...config, message: e.target.value })}
              rows={3}
            />
          </div>
        );
      
      case 'assign_to':
        return (
          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select
              value={config.user_id || ''}
              onValueChange={(value) => setConfig({ ...config, user_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-Assign</SelectItem>
                <SelectItem value="round_robin">Round Robin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      
      case 'add_tag':
      case 'remove_tag':
        return (
          <div className="space-y-2">
            <Label>Tag Name</Label>
            <Input
              placeholder="Enter tag name"
              value={config.tag_name || ''}
              onChange={(e) => setConfig({ ...config, tag_name: e.target.value })}
            />
          </div>
        );
      
      case 'create_task':
        return (
          <>
            <div className="space-y-2">
              <Label>Task Title</Label>
              <Input
                placeholder="Task title"
                value={config.title || ''}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Task description"
                value={config.description || ''}
                onChange={(e) => setConfig({ ...config, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={config.priority || 'medium'}
                onValueChange={(value) => setConfig({ ...config, priority: value })}
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
          </>
        );
      
      case 'enroll_campaign':
        return (
          <div className="space-y-2">
            <Label>Campaign ID</Label>
            <Input
              placeholder="Enter campaign ID"
              value={config.campaign_id || ''}
              onChange={(e) => setConfig({ ...config, campaign_id: e.target.value })}
            />
          </div>
        );
      
      case 'update_field':
        return (
          <>
            <div className="space-y-2">
              <Label>Field Name</Label>
              <Input
                placeholder="e.g., status, lead_score"
                value={config.field_name || ''}
                onChange={(e) => setConfig({ ...config, field_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>New Value</Label>
              <Input
                placeholder="New value"
                value={config.field_value || ''}
                onChange={(e) => setConfig({ ...config, field_value: e.target.value })}
              />
            </div>
          </>
        );
      
      case 'webhook':
        return (
          <>
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                type="url"
                placeholder="https://..."
                value={config.url || ''}
                onChange={(e) => setConfig({ ...config, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>HTTP Method</Label>
              <Select
                value={config.method || 'POST'}
                onValueChange={(value) => setConfig({ ...config, method: value })}
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
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {action ? 'Edit Action' : 'Add Action'}
          </DialogTitle>
          <DialogDescription>
            Configure the action to execute when the rule triggers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Action Type */}
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="send_email">Send Email</SelectItem>
                <SelectItem value="send_sms">Send SMS</SelectItem>
                <SelectItem value="assign_to">Assign To User</SelectItem>
                <SelectItem value="add_tag">Add Tag</SelectItem>
                <SelectItem value="remove_tag">Remove Tag</SelectItem>
                <SelectItem value="create_task">Create Task</SelectItem>
                <SelectItem value="enroll_campaign">Enroll in Campaign</SelectItem>
                <SelectItem value="update_field">Update Field</SelectItem>
                <SelectItem value="webhook">Call Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Delay */}
          <div className="space-y-2">
            <Label>Delay (minutes)</Label>
            <Input
              type="number"
              min="0"
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 0)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Wait this many minutes before executing this action
            </p>
          </div>

          {/* Action-specific configuration */}
          {renderConfigForm()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {action ? 'Update Action' : 'Add Action'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
