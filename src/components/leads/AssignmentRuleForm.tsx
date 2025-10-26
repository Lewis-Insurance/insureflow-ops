// src/components/leads/AssignmentRuleForm.tsx

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateAssignmentRule, useUpdateAssignmentRule } from '@/hooks/useAssignmentRules';
import type { AssignmentRule, AssignmentRuleCreateInput, AssignmentStrategy } from '@/types/leadAssignment';

interface AssignmentRuleFormProps {
  accountId: string;
  rule?: AssignmentRule;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  description: string;
  priority: number;
  assignment_strategy: AssignmentStrategy;
  min_lead_score?: number;
  max_lead_score?: number;
  insurance_types?: string;
  states?: string;
  premium_min?: number;
  premium_max?: number;
}

export function AssignmentRuleForm({ accountId, rule, onSuccess, onCancel }: AssignmentRuleFormProps) {
  const isEdit = !!rule;
  const createRule = useCreateAssignmentRule(accountId);
  const updateRule = useUpdateAssignmentRule(rule?.id || '');
  
  const [eligibleUsers, setEligibleUsers] = useState<string>(
    rule?.eligible_users?.join(', ') || ''
  );

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: rule?.name || '',
      description: rule?.description || '',
      priority: rule?.priority || 10,
      assignment_strategy: rule?.assignment_strategy || 'round_robin',
      min_lead_score: rule?.conditions?.min_lead_score,
      max_lead_score: rule?.conditions?.max_lead_score,
      insurance_types: rule?.conditions?.insurance_types?.join(', '),
      states: rule?.conditions?.states?.join(', '),
      premium_min: rule?.conditions?.premium_min,
      premium_max: rule?.conditions?.premium_max,
    },
  });

  const strategy = watch('assignment_strategy');

  const onSubmit = async (data: FormData) => {
    const eligibleUserIds = eligibleUsers
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (eligibleUserIds.length === 0) {
      alert('Please enter at least one eligible user ID');
      return;
    }

    const conditions: any = {};
    if (data.min_lead_score) conditions.min_lead_score = data.min_lead_score;
    if (data.max_lead_score) conditions.max_lead_score = data.max_lead_score;
    if (data.premium_min) conditions.premium_min = data.premium_min;
    if (data.premium_max) conditions.premium_max = data.premium_max;
    
    if (data.insurance_types) {
      conditions.insurance_types = data.insurance_types
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
    }
    
    if (data.states) {
      conditions.states = data.states
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(s => s.length > 0);
    }

    const payload: AssignmentRuleCreateInput = {
      name: data.name,
      description: data.description,
      priority: data.priority,
      assignment_strategy: data.assignment_strategy,
      conditions: Object.keys(conditions).length > 0 ? conditions : undefined,
      eligible_users: eligibleUserIds,
    };

    try {
      if (isEdit) {
        await updateRule.mutateAsync(payload);
      } else {
        await createRule.mutateAsync(payload);
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save rule:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Rule Name *</Label>
          <Input
            id="name"
            {...register('name', { required: 'Name is required' })}
            placeholder="e.g., High-Value Auto Leads"
          />
          {errors.name && (
            <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            {...register('description')}
            placeholder="Describe when this rule should apply..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              {...register('priority', { 
                required: 'Priority is required',
                min: { value: 1, message: 'Priority must be at least 1' }
              })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Higher numbers = higher priority
            </p>
            {errors.priority && (
              <p className="text-sm text-destructive mt-1">{errors.priority.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="assignment_strategy">Strategy *</Label>
            <Select
              value={strategy}
              onValueChange={(value) => setValue('assignment_strategy', value as AssignmentStrategy)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Round Robin</SelectItem>
                <SelectItem value="workload">Workload-Based</SelectItem>
                <SelectItem value="territory">Territory-Based</SelectItem>
                <SelectItem value="specialty">Specialty-Based</SelectItem>
                <SelectItem value="performance">Performance-Based</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="eligible_users">Eligible Producer IDs *</Label>
          <Input
            id="eligible_users"
            value={eligibleUsers}
            onChange={(e) => setEligibleUsers(e.target.value)}
            placeholder="user-id-1, user-id-2, user-id-3"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated list of user IDs who can receive leads from this rule
          </p>
        </div>
      </div>

      {/* Conditions */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold">Assignment Conditions (Optional)</h3>
        <p className="text-sm text-muted-foreground">
          Define criteria for when this rule should apply
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min_lead_score">Min Lead Score</Label>
            <Input
              id="min_lead_score"
              type="number"
              {...register('min_lead_score', { min: 0, max: 100 })}
              placeholder="0"
            />
          </div>

          <div>
            <Label htmlFor="max_lead_score">Max Lead Score</Label>
            <Input
              id="max_lead_score"
              type="number"
              {...register('max_lead_score', { min: 0, max: 100 })}
              placeholder="100"
            />
          </div>

          <div>
            <Label htmlFor="premium_min">Min Premium ($)</Label>
            <Input
              id="premium_min"
              type="number"
              {...register('premium_min', { min: 0 })}
              placeholder="0"
            />
          </div>

          <div>
            <Label htmlFor="premium_max">Max Premium ($)</Label>
            <Input
              id="premium_max"
              type="number"
              {...register('premium_max', { min: 0 })}
              placeholder="No limit"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="insurance_types">Insurance Types</Label>
          <Input
            id="insurance_types"
            {...register('insurance_types')}
            placeholder="auto, home, life"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated list of insurance types
          </p>
        </div>

        <div>
          <Label htmlFor="states">States</Label>
          <Input
            id="states"
            {...register('states')}
            placeholder="CA, NY, TX"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Comma-separated state codes (e.g., CA, NY, TX)
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={createRule.isPending || updateRule.isPending}
        >
          {(createRule.isPending || updateRule.isPending) ? 'Saving...' : (isEdit ? 'Update Rule' : 'Create Rule')}
        </Button>
      </div>
    </form>
  );
}
