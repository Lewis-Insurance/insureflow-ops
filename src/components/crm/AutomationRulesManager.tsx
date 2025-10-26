import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Zap, Trash2, Play, Pause, Edit } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type TriggerType = 'tag_added' | 'tag_removed' | 'carrier_changed' | 'policy_type_changed' | 'status_changed' | 'custom_field_changed' | 'renewal_approaching' | 'premium_threshold';
type ActionType = 'assign_user' | 'add_tag' | 'remove_tag' | 'send_email' | 'create_task' | 'update_field' | 'send_notification' | 'webhook';

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: TriggerType;
  triggerConditions: Record<string, any>;
  actions: AutomationAction[];
  entityTypes: ('lead' | 'policy' | 'account' | 'renewal')[];
  lastRun?: Date;
  runCount: number;
}

interface AutomationAction {
  type: ActionType;
  params: Record<string, any>;
}

// Insurance-specific automation templates
const AUTOMATION_TEMPLATES: Partial<AutomationRule>[] = [
  {
    name: 'High-Value Lead Auto-Assignment',
    description: 'Automatically assign leads with premium over $5k to senior agents',
    triggerType: 'custom_field_changed',
    triggerConditions: { field: 'current_premium', operator: 'greater_than', value: 5000 },
    actions: [
      { type: 'add_tag', params: { tag: 'high-value' } },
      { type: 'assign_user', params: { role: 'senior-agent' } },
    ],
    entityTypes: ['lead'],
  },
  {
    name: 'Multi-Policy Cross-Sell Alert',
    description: 'Create task when customer has only one policy type',
    triggerType: 'tag_added',
    triggerConditions: { tag: 'single-policy' },
    actions: [
      { type: 'create_task', params: { title: 'Cross-sell opportunity', priority: 'high' } },
      { type: 'add_tag', params: { tag: 'cross-sell-opportunity' } },
    ],
    entityTypes: ['account', 'policy'],
  },
  {
    name: 'Renewal Risk Mitigation',
    description: 'Flag renewals with price increases over 15%',
    triggerType: 'custom_field_changed',
    triggerConditions: { field: 'price_change_pct', operator: 'greater_than', value: 15 },
    actions: [
      { type: 'add_tag', params: { tag: 'retention-risk' } },
      { type: 'create_task', params: { title: 'Review renewal pricing', priority: 'urgent' } },
      { type: 'send_notification', params: { message: 'High price increase detected' } },
    ],
    entityTypes: ['renewal'],
  },
  {
    name: 'Preferred Carrier Routing',
    description: 'Route leads to specialist when specific carrier is mentioned',
    triggerType: 'carrier_changed',
    triggerConditions: { carrier: 'Progressive' },
    actions: [
      { type: 'add_tag', params: { tag: 'progressive-quote' } },
      { type: 'assign_user', params: { userId: 'progressive-specialist' } },
    ],
    entityTypes: ['lead'],
  },
  {
    name: 'Commercial Policy Special Handling',
    description: 'Tag and route commercial policies to business insurance team',
    triggerType: 'policy_type_changed',
    triggerConditions: { policyType: 'commercial' },
    actions: [
      { type: 'add_tag', params: { tag: 'commercial-line' } },
      { type: 'assign_user', params: { team: 'commercial' } },
      { type: 'send_email', params: { template: 'commercial-welcome' } },
    ],
    entityTypes: ['lead', 'policy'],
  },
  {
    name: 'Claims-Free Discount Opportunity',
    description: 'Tag accounts with 5+ claims-free years for discount review',
    triggerType: 'custom_field_changed',
    triggerConditions: { field: 'claims_free_years', operator: 'greater_than', value: 4 },
    actions: [
      { type: 'add_tag', params: { tag: 'discount-eligible' } },
      { type: 'create_task', params: { title: 'Review discount opportunities' } },
    ],
    entityTypes: ['account', 'policy'],
  },
];

interface AutomationRulesManagerProps {
  entityType?: 'lead' | 'policy' | 'account' | 'renewal';
  rules?: AutomationRule[];
  onRulesChange?: (rules: AutomationRule[]) => void;
}

export function AutomationRulesManager({ 
  entityType,
  rules = [],
  onRulesChange 
}: AutomationRulesManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [newRule, setNewRule] = useState<Partial<AutomationRule>>({
    enabled: true,
    actions: [],
    entityTypes: entityType ? [entityType] : [],
    runCount: 0,
  });

  const relevantTemplates = entityType 
    ? AUTOMATION_TEMPLATES.filter(t => t.entityTypes?.includes(entityType))
    : AUTOMATION_TEMPLATES;

  const handleSaveRule = () => {
    if (!newRule.name || !newRule.triggerType || !newRule.actions?.length) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in name, trigger, and at least one action',
        variant: 'destructive',
      });
      return;
    }

    const rule: AutomationRule = {
      id: editingRule?.id || `rule-${Date.now()}`,
      name: newRule.name!,
      description: newRule.description,
      enabled: newRule.enabled ?? true,
      triggerType: newRule.triggerType!,
      triggerConditions: newRule.triggerConditions || {},
      actions: newRule.actions!,
      entityTypes: newRule.entityTypes || [],
      runCount: editingRule?.runCount || 0,
    };

    const updatedRules = editingRule
      ? rules.map(r => r.id === editingRule.id ? rule : r)
      : [...rules, rule];

    onRulesChange?.(updatedRules);
    setIsDialogOpen(false);
    setNewRule({ enabled: true, actions: [], entityTypes: entityType ? [entityType] : [], runCount: 0 });
    setEditingRule(null);

    toast({
      title: editingRule ? 'Rule updated' : 'Rule created',
      description: `Automation rule "${rule.name}" has been saved`,
    });
  };

  const handleToggleRule = (ruleId: string) => {
    const updatedRules = rules.map(r => 
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    onRulesChange?.(updatedRules);
    
    const rule = rules.find(r => r.id === ruleId);
    toast({
      title: rule?.enabled ? 'Rule disabled' : 'Rule enabled',
      description: `Automation rule "${rule?.name}" is now ${rule?.enabled ? 'inactive' : 'active'}`,
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    const updatedRules = rules.filter(r => r.id !== ruleId);
    onRulesChange?.(updatedRules);
    toast({
      title: 'Rule deleted',
      description: 'Automation rule has been removed',
    });
  };

  const handleApplyTemplate = (template: Partial<AutomationRule>) => {
    setNewRule({
      ...template,
      entityTypes: entityType ? [entityType] : template.entityTypes,
      enabled: true,
      runCount: 0,
    });
  };

  const getTriggerLabel = (type: TriggerType): string => {
    const labels: Record<TriggerType, string> = {
      tag_added: 'Tag Added',
      tag_removed: 'Tag Removed',
      carrier_changed: 'Carrier Changed',
      policy_type_changed: 'Policy Type Changed',
      status_changed: 'Status Changed',
      custom_field_changed: 'Custom Field Changed',
      renewal_approaching: 'Renewal Approaching',
      premium_threshold: 'Premium Threshold',
    };
    return labels[type];
  };

  const getActionLabel = (type: ActionType): string => {
    const labels: Record<ActionType, string> = {
      assign_user: 'Assign User/Team',
      add_tag: 'Add Tag',
      remove_tag: 'Remove Tag',
      send_email: 'Send Email',
      create_task: 'Create Task',
      update_field: 'Update Field',
      send_notification: 'Send Notification',
      webhook: 'Call Webhook',
    };
    return labels[type];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Automation Rules
            </CardTitle>
            <CardDescription>
              Trigger actions based on tags, carriers, policy types, and custom fields
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingRule ? 'Edit Automation Rule' : 'Create Automation Rule'}
                </DialogTitle>
                <DialogDescription>
                  Define triggers and actions for automated workflows
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Quick Templates */}
                {!editingRule && relevantTemplates.length > 0 && (
                  <div className="space-y-2">
                    <Label>Insurance Templates</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {relevantTemplates.map((template, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          onClick={() => handleApplyTemplate(template)}
                          className="h-auto text-left justify-start"
                        >
                          <div>
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-muted-foreground">{template.description}</div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rule Configuration */}
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input
                    placeholder="e.g., High-Value Lead Assignment"
                    value={newRule.name || ''}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="What does this rule do?"
                    value={newRule.description || ''}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Trigger Type</Label>
                  <Select
                    value={newRule.triggerType}
                    onValueChange={(value: TriggerType) => setNewRule({ ...newRule, triggerType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tag_added">Tag Added</SelectItem>
                      <SelectItem value="tag_removed">Tag Removed</SelectItem>
                      <SelectItem value="carrier_changed">Carrier Changed</SelectItem>
                      <SelectItem value="policy_type_changed">Policy Type Changed</SelectItem>
                      <SelectItem value="status_changed">Status Changed</SelectItem>
                      <SelectItem value="custom_field_changed">Custom Field Changed</SelectItem>
                      <SelectItem value="renewal_approaching">Renewal Approaching</SelectItem>
                      <SelectItem value="premium_threshold">Premium Threshold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Applies To</Label>
                  <div className="flex gap-2">
                    {['lead', 'policy', 'account', 'renewal'].map((type) => (
                      <Badge
                        key={type}
                        variant={newRule.entityTypes?.includes(type as any) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const types = newRule.entityTypes || [];
                          const updated = types.includes(type as any)
                            ? types.filter(t => t !== type)
                            : [...types, type as any];
                          setNewRule({ ...newRule, entityTypes: updated });
                        }}
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={newRule.enabled}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, enabled: checked })}
                  />
                  <Label>Enable rule immediately</Label>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleSaveRule} className="flex-1">
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsDialogOpen(false);
                      setNewRule({ enabled: true, actions: [], entityTypes: entityType ? [entityType] : [], runCount: 0 });
                      setEditingRule(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No automation rules defined yet</p>
            <p className="text-sm">Create rules to automate workflows based on tags, carriers, and more</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start justify-between p-4 bg-muted/50 rounded-lg border"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    {rule.enabled ? (
                      <Badge variant="default" className="bg-green-600">
                        <Play className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Pause className="h-3 w-3 mr-1" />
                        Paused
                      </Badge>
                    )}
                    <Badge variant="outline">{rule.runCount} runs</Badge>
                  </div>
                  {rule.description && (
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      Trigger: {getTriggerLabel(rule.triggerType)}
                    </Badge>
                    {rule.actions.map((action, idx) => (
                      <Badge key={idx} variant="secondary">
                        → {getActionLabel(action.type)}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {rule.entityTypes.map((type) => (
                      <Badge key={type} variant="outline" className="text-xs">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleToggleRule(rule.id)}
                  >
                    {rule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingRule(rule);
                      setNewRule(rule);
                      setIsDialogOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteRule(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
