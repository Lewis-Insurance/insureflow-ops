// src/components/leads/AssignmentRulesManager.tsx

import { useState } from 'react';
import { Plus, Settings, ToggleLeft, ToggleRight, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAssignmentRules, useDeleteAssignmentRule, useToggleAssignmentRule } from '@/hooks/useAssignmentRules';
import { AssignmentRuleForm } from './AssignmentRuleForm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { AssignmentRule } from '@/types/leadAssignment';

interface AssignmentRulesManagerProps {
  accountId: string;
}

export function AssignmentRulesManager({ accountId }: AssignmentRulesManagerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AssignmentRule | null>(null);

  const { data: rules, isLoading, error } = useAssignmentRules(accountId);
  const deleteRule = useDeleteAssignmentRule();
  const toggleRule = useToggleAssignmentRule(editingRule?.id || '');

  const handleDelete = async (ruleId: string) => {
    if (confirm('Are you sure you want to delete this assignment rule?')) {
      await deleteRule.mutateAsync(ruleId);
    }
  };

  const handleToggle = async (rule: AssignmentRule) => {
    await toggleRule.mutateAsync(!rule.is_active);
  };

  const getStrategyLabel = (strategy: string) => {
    const labels: Record<string, string> = {
      round_robin: 'Round Robin',
      territory: 'Territory-Based',
      specialty: 'Specialty-Based',
      performance: 'Performance-Based',
      workload: 'Workload-Based',
      custom: 'Custom Rules',
    };
    return labels[strategy] || strategy;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load assignment rules: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Assignment Rules</h2>
          <p className="text-muted-foreground">
            Automatically route leads to the right producers
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {!rules || rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No assignment rules yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first rule to automatically assign leads to producers
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.is_active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-lg">{rule.name}</CardTitle>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline">
                        Priority: {rule.priority}
                      </Badge>
                    </div>
                    <CardDescription>{rule.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggle(rule)}
                    >
                      {rule.is_active ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingRule(rule)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium">Strategy:</span>{' '}
                    <Badge variant="outline">{getStrategyLabel(rule.assignment_strategy)}</Badge>
                  </div>
                  
                  <div>
                    <span className="text-sm font-medium">Eligible Producers:</span>{' '}
                    <span className="text-sm text-muted-foreground">
                      {rule.eligible_users?.length || 0} assigned
                    </span>
                  </div>

                  {rule.conditions && Object.keys(rule.conditions).length > 0 && (
                    <div>
                      <span className="text-sm font-medium">Conditions:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {rule.conditions.min_lead_score && (
                          <Badge variant="secondary">
                            Score ≥ {rule.conditions.min_lead_score}
                          </Badge>
                        )}
                        {rule.conditions.max_lead_score && (
                          <Badge variant="secondary">
                            Score ≤ {rule.conditions.max_lead_score}
                          </Badge>
                        )}
                        {rule.conditions.insurance_types && rule.conditions.insurance_types.length > 0 && (
                          <Badge variant="secondary">
                            Types: {rule.conditions.insurance_types.join(', ')}
                          </Badge>
                        )}
                        {rule.conditions.states && rule.conditions.states.length > 0 && (
                          <Badge variant="secondary">
                            States: {rule.conditions.states.join(', ')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {rule.last_assigned_to && (
                    <div className="text-xs text-muted-foreground">
                      Last assigned: {new Date(rule.last_assigned_at || '').toLocaleString()}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Assignment Rule</DialogTitle>
            <DialogDescription>
              Set up automatic lead assignment based on your criteria
            </DialogDescription>
          </DialogHeader>
          <AssignmentRuleForm
            accountId={accountId}
            onSuccess={() => setIsCreateDialogOpen(false)}
            onCancel={() => setIsCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingRule} onOpenChange={() => setEditingRule(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Assignment Rule</DialogTitle>
            <DialogDescription>
              Update the assignment rule settings
            </DialogDescription>
          </DialogHeader>
          {editingRule && (
            <AssignmentRuleForm
              accountId={accountId}
              rule={editingRule}
              onSuccess={() => setEditingRule(null)}
              onCancel={() => setEditingRule(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
