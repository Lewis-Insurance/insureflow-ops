import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TaskTemplate, TriggerEvent } from '@/hooks/useTaskTemplates';
import { TaskCategory, TaskPriority } from '@/hooks/useTasks';

interface TaskTemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TaskTemplate | null;
  onSubmit: (templateData: Partial<TaskTemplate>) => Promise<void>;
}

export function TaskTemplateForm({ open, onOpenChange, template, onSubmit }: TaskTemplateFormProps) {
  const [formData, setFormData] = useState<Partial<TaskTemplate>>({
    name: '',
    description: '',
    category: 'general' as TaskCategory,
    trigger_event: 'manual' as TriggerEvent,
    priority: 'medium' as TaskPriority,
    estimated_duration_hours: undefined,
    task_order: 0,
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        category: template.category,
        trigger_event: template.trigger_event,
        priority: template.priority,
        estimated_duration_hours: template.estimated_duration_hours,
        task_order: template.task_order,
        is_active: template.is_active,
      });
    } else {
      setFormData({
        name: '',
        description: '',
        category: 'general' as TaskCategory,
        trigger_event: 'manual' as TriggerEvent,
        priority: 'medium' as TaskPriority,
        estimated_duration_hours: undefined,
        task_order: 0,
        is_active: true,
      });
    }
  }, [template, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Task Template' : 'Create Task Template'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="e.g., Initial Quote Review"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this task entails..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="trigger_event">Trigger Event *</Label>
              <Select
                value={formData.trigger_event}
                onValueChange={(value: TriggerEvent) => setFormData({ ...formData, trigger_event: value })}
              >
                <SelectTrigger id="trigger_event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="quote_requested">Quote Requested</SelectItem>
                  <SelectItem value="quote_accepted">Quote Accepted</SelectItem>
                  <SelectItem value="policy_issued">Policy Issued</SelectItem>
                  <SelectItem value="policy_renewal_due">Policy Renewal Due</SelectItem>
                  <SelectItem value="claim_filed">Claim Filed</SelectItem>
                  <SelectItem value="payment_overdue">Payment Overdue</SelectItem>
                  <SelectItem value="service_request">Service Request</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value: TaskCategory) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                  <SelectItem value="claim">Claim</SelectItem>
                  <SelectItem value="renewal">Renewal</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="priority">Default Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: TaskPriority) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger id="priority">
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

            <div>
              <Label htmlFor="estimated_duration_hours">Duration (hours)</Label>
              <Input
                id="estimated_duration_hours"
                type="number"
                min="0"
                value={formData.estimated_duration_hours || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  estimated_duration_hours: e.target.value ? parseInt(e.target.value) : undefined 
                })}
                placeholder="24"
              />
            </div>

            <div>
              <Label htmlFor="task_order">Order</Label>
              <Input
                id="task_order"
                type="number"
                min="0"
                value={formData.task_order}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  task_order: parseInt(e.target.value) || 0 
                })}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Template is active (will auto-generate tasks)
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
