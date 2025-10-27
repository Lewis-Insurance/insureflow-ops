import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Plus, X } from 'lucide-react';

interface TriggerConditionsBuilderProps {
  conditions: any;
  onChange: (conditions: any) => void;
}

export function TriggerConditionsBuilder({ conditions, onChange }: TriggerConditionsBuilderProps) {
  const [localConditions, setLocalConditions] = useState(conditions || {});

  const updateCondition = (key: string, value: any) => {
    const updated = { ...localConditions, [key]: value };
    setLocalConditions(updated);
    onChange(updated);
  };

  const addLeadStatus = (status: string) => {
    const current = localConditions.lead_status || [];
    if (!current.includes(status)) {
      updateCondition('lead_status', [...current, status]);
    }
  };

  const removeLeadStatus = (status: string) => {
    const current = localConditions.lead_status || [];
    updateCondition('lead_status', current.filter((s: string) => s !== status));
  };

  const addInsuranceType = (type: string) => {
    const current = localConditions.insurance_types || [];
    if (!current.includes(type)) {
      updateCondition('insurance_types', [...current, type]);
    }
  };

  const removeInsuranceType = (type: string) => {
    const current = localConditions.insurance_types || [];
    updateCondition('insurance_types', current.filter((t: string) => t !== type));
  };

  const addTag = (tag: string) => {
    const current = localConditions.tags || [];
    if (!current.includes(tag) && tag.trim()) {
      updateCondition('tags', [...current, tag.trim()]);
    }
  };

  const removeTag = (tag: string) => {
    const current = localConditions.tags || [];
    updateCondition('tags', current.filter((t: string) => t !== tag));
  };

  return (
    <div className="space-y-6">
      {/* Lead Status */}
      <div className="space-y-3">
        <Label>Lead Status</Label>
        <div className="flex gap-2">
          <Select onValueChange={addLeadStatus}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select lead status..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="quoted">Quoted</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
              <SelectItem value="nurturing">Nurturing</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {(localConditions.lead_status || []).map((status: string) => (
            <Badge key={status} variant="secondary">
              {status}
              <button
                onClick={() => removeLeadStatus(status)}
                className="ml-2 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Lead Score Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min Lead Score</Label>
          <Input
            type="number"
            min="0"
            max="100"
            placeholder="0"
            value={localConditions.lead_score_min || ''}
            onChange={(e) => updateCondition('lead_score_min', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>Max Lead Score</Label>
          <Input
            type="number"
            min="0"
            max="100"
            placeholder="100"
            value={localConditions.lead_score_max || ''}
            onChange={(e) => updateCondition('lead_score_max', parseInt(e.target.value) || 100)}
          />
        </div>
      </div>

      {/* Insurance Types */}
      <div className="space-y-3">
        <Label>Insurance Types</Label>
        <div className="flex gap-2">
          <Select onValueChange={addInsuranceType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select insurance type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="home">Home</SelectItem>
              <SelectItem value="life">Life</SelectItem>
              <SelectItem value="commercial">Commercial</SelectItem>
              <SelectItem value="health">Health</SelectItem>
              <SelectItem value="umbrella">Umbrella</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          {(localConditions.insurance_types || []).map((type: string) => (
            <Badge key={type} variant="secondary">
              {type}
              <button
                onClick={() => removeInsuranceType(type)}
                className="ml-2 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-3">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Enter tag and press Enter..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(localConditions.tags || []).map((tag: string) => (
            <Badge key={tag} variant="secondary">
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-2 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Time-based Trigger */}
      <Card className="p-4 space-y-4">
        <Label>Time-Based Trigger (Optional)</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">After Event</Label>
            <Select
              value={localConditions.time_based?.after_event || ''}
              onValueChange={(value) =>
                updateCondition('time_based', {
                  ...localConditions.time_based,
                  after_event: value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select event..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead_created">Lead Created</SelectItem>
                <SelectItem value="last_contact">Last Contact</SelectItem>
                <SelectItem value="lead_lost">Lead Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Delay (Days)</Label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={localConditions.time_based?.delay_days || ''}
              onChange={(e) =>
                updateCondition('time_based', {
                  ...localConditions.time_based,
                  delay_days: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>
      </Card>

      <div className="text-sm text-muted-foreground">
        Leads matching ALL conditions will be automatically enrolled in this campaign.
      </div>
    </div>
  );
}
