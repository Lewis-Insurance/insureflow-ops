import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAutomationRule,
  useCreateAutomationRule,
  useUpdateAutomationRule,
} from '@/integrations/supabase/hooks/useAutomationRules';
import { ActionBuilder } from './ActionBuilder';
import { Separator } from '@/components/ui/separator';

interface RuleBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId?: string | null;
}

export function RuleBuilderModal({ open, onOpenChange, ruleId }: RuleBuilderModalProps) {
  const { data: existingRule } = useAutomationRule(ruleId || undefined);
  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('lead_created');
  const [appliesTo, setAppliesTo] = useState('lead');
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState(0);

  useEffect(() => {
    if (existingRule) {
      setName(existingRule.name);
      setDescription(existingRule.description || '');
      setTriggerType(existingRule.trigger_type);
      setAppliesTo(existingRule.applies_to);
      setIsActive(existingRule.is_active);
      setPriority(existingRule.priority);
    } else {
      // Reset form
      setName('');
      setDescription('');
      setTriggerType('lead_created');
      setAppliesTo('lead');
      setIsActive(true);
      setPriority(0);
    }
  }, [existingRule, open]);

  const handleSave = async () => {
    if (ruleId) {
      // Update existing rule
      const ruleData = {
        name,
        description,
        trigger_type: triggerType,
        applies_to: appliesTo,
        is_active: isActive,
        priority,
        trigger_conditions: {},
      };
      await updateRule.mutateAsync({ id: ruleId, updates: ruleData });
    } else {
      // Create new rule - account_id will be set by the hook
      const ruleData = {
        name,
        description,
        trigger_type: triggerType,
        applies_to: appliesTo,
        is_active: isActive,
        priority,
        trigger_conditions: {},
      };
      await createRule.mutateAsync(ruleData);
    }
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ruleId ? 'Edit Automation Rule' : 'Create Automation Rule'}
          </DialogTitle>
          <DialogDescription>
            Define triggers and actions for automated workflows
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configuration</h3>
            
            {/* Rule Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., High-Value Lead Auto-Assignment"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this rule do?"
                rows={3}
              />
            </div>

            <Separator />

            {/* Trigger Type */}
            <div className="space-y-2">
              <Label>Trigger Type</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead_created">Lead Created</SelectItem>
                  <SelectItem value="lead_status_changed">Lead Status Changed</SelectItem>
                  <SelectItem value="lead_score_changed">Lead Score Changed</SelectItem>
                  <SelectItem value="policy_created">Policy Created</SelectItem>
                  <SelectItem value="policy_type_changed">Policy Type Changed</SelectItem>
                  <SelectItem value="policy_status_changed">Policy Status Changed</SelectItem>
                  <SelectItem value="policy_renewed">Policy Renewed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Applies To */}
            <div className="space-y-2">
              <Label>Applies To</Label>
              <div className="flex gap-2">
                {['lead', 'policy', 'account', 'renewal'].map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={appliesTo === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAppliesTo(type)}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Higher priority rules execute first
              </p>
            </div>

            {/* Enable Immediately */}
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Enable rule immediately</Label>
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-4 border-l pl-6">
            <h3 className="text-lg font-semibold">Actions</h3>
            {ruleId ? (
              <ActionBuilder ruleId={ruleId} />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Save the rule first to add actions
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || !triggerType}>
            {ruleId ? 'Update Rule' : 'Create Rule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
