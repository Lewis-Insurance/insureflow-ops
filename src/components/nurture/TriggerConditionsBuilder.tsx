import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, X } from 'lucide-react';

interface TriggerConditionsBuilderProps {
  conditions: any;
  onChange: (conditions: any) => void;
}

export function TriggerConditionsBuilder({ conditions, onChange }: TriggerConditionsBuilderProps) {
  const [selectedConditionType, setSelectedConditionType] = useState<string>('');

  const handleAddLeadStatus = (status: string) => {
    const currentStatuses = conditions.lead_status || [];
    if (!currentStatuses.includes(status)) {
      onChange({
        ...conditions,
        lead_status: [...currentStatuses, status],
      });
    }
  };

  const handleRemoveLeadStatus = (status: string) => {
    onChange({
      ...conditions,
      lead_status: (conditions.lead_status || []).filter((s: string) => s !== status),
    });
  };

  const handleAddTag = (tag: string) => {
    const currentTags = conditions.tags || [];
    if (tag && !currentTags.includes(tag)) {
      onChange({
        ...conditions,
        tags: [...currentTags, tag],
      });
    }
  };

  const handleRemoveTag = (tag: string) => {
    onChange({
      ...conditions,
      tags: (conditions.tags || []).filter((t: string) => t !== tag),
    });
  };

  const handleLeadScoreChange = (field: 'lead_score_min' | 'lead_score_max', value: string) => {
    const numValue = value === '' ? undefined : parseInt(value, 10);
    onChange({
      ...conditions,
      [field]: numValue,
    });
  };

  return (
    <div className="space-y-6">
      {/* Add Condition Type Selector */}
      <div className="flex gap-2">
        <Select value={selectedConditionType} onValueChange={setSelectedConditionType}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Add trigger condition..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lead_status">Lead Status</SelectItem>
            <SelectItem value="lead_score">Lead Score Range</SelectItem>
            <SelectItem value="tags">Tags</SelectItem>
            <SelectItem value="insurance_types">Insurance Types</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lead Status */}
      {(conditions.lead_status?.length > 0 || selectedConditionType === 'lead_status') && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Label>When lead status is:</Label>
              <div className="flex flex-wrap gap-2">
                {['new', 'contacted', 'qualified', 'nurturing', 'lost'].map((status) => {
                  const isSelected = conditions.lead_status?.includes(status);
                  return (
                    <Badge
                      key={status}
                      variant={isSelected ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() =>
                        isSelected
                          ? handleRemoveLeadStatus(status)
                          : handleAddLeadStatus(status)
                      }
                    >
                      {status}
                      {isSelected && <X className="ml-1 h-3 w-3" />}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lead Score Range */}
      {(conditions.lead_score_min !== undefined ||
        conditions.lead_score_max !== undefined ||
        selectedConditionType === 'lead_score') && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Label>Lead Score Range</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="score-min" className="text-sm text-muted-foreground">
                    Minimum Score
                  </Label>
                  <Input
                    id="score-min"
                    type="number"
                    placeholder="0"
                    value={conditions.lead_score_min || ''}
                    onChange={(e) => handleLeadScoreChange('lead_score_min', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="score-max" className="text-sm text-muted-foreground">
                    Maximum Score
                  </Label>
                  <Input
                    id="score-max"
                    type="number"
                    placeholder="100"
                    value={conditions.lead_score_max || ''}
                    onChange={(e) => handleLeadScoreChange('lead_score_max', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {(conditions.tags?.length > 0 || selectedConditionType === 'tags') && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Label>When lead has tags:</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter tag name..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTag(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    if (input?.value) {
                      handleAddTag(input.value);
                      input.value = '';
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {conditions.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {conditions.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {Object.keys(conditions).length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          No trigger conditions set. Select a condition type above to get started.
        </div>
      )}
    </div>
  );
}
