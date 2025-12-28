// ============================================
// Question Editor Component
// Editor panel for intake form questions
// ============================================

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { IntakeQuestion, QuestionType } from '@/types/intake';
import { Plus, Trash2 } from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface QuestionTypeOption {
  type: QuestionType;
  label: string;
  icon: React.ReactNode;
  hasOptions: boolean;
}

interface QuestionEditorProps {
  question: IntakeQuestion;
  allQuestions: IntakeQuestion[];
  questionTypes: QuestionTypeOption[];
  onChange: (updates: Partial<IntakeQuestion>) => void;
  onDelete: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function QuestionEditor({
  question,
  allQuestions,
  questionTypes,
  onChange,
  onDelete,
}: QuestionEditorProps) {
  const typeInfo = questionTypes.find(t => t.type === question.type);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit Question</SheetTitle>
        <SheetDescription>Configure the question settings</SheetDescription>
      </SheetHeader>

      <ScrollArea className="h-[calc(100vh-180px)] mt-4">
        <div className="space-y-6 pr-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label>Question Label</Label>
              <Input
                value={question.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>

            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={question.description || ''}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="Additional context for the question"
              />
            </div>

            <div>
              <Label>Placeholder Text</Label>
              <Input
                value={question.placeholder || ''}
                onChange={(e) => onChange({ placeholder: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Required</Label>
                <p className="text-sm text-muted-foreground">
                  Make this question mandatory
                </p>
              </div>
              <Switch
                checked={question.required}
                onCheckedChange={(checked) => onChange({ required: checked })}
              />
            </div>
          </div>

          <Separator />

          {/* Options (for select, radio, multi_select) */}
          {typeInfo?.hasOptions && (
            <div className="space-y-4">
              <Label>Options</Label>
              {question.options?.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={option.label}
                    onChange={(e) => {
                      const newOptions = [...(question.options || [])];
                      newOptions[index] = {
                        ...option,
                        label: e.target.value,
                        value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                      };
                      onChange({ options: newOptions });
                    }}
                    placeholder={`Option ${index + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newOptions = question.options?.filter(
                        (_, i) => i !== index
                      );
                      onChange({ options: newOptions });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newOptions = [
                    ...(question.options || []),
                    { value: '', label: '' },
                  ];
                  onChange({ options: newOptions });
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Option
              </Button>
            </div>
          )}

          {/* Conditional Display */}
          <div className="space-y-4">
            <Label>Conditional Display</Label>
            <p className="text-sm text-muted-foreground">
              Show this question only when another question meets certain criteria
            </p>

            <Select
              value={question.conditionalDisplay?.dependsOn || ''}
              onValueChange={(value) => {
                if (!value) {
                  onChange({ conditionalDisplay: undefined });
                } else {
                  onChange({
                    conditionalDisplay: {
                      dependsOn: value,
                      operator: 'equals',
                      value: '',
                      showWhenTrue: true,
                    },
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="No condition (always show)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No condition</SelectItem>
                {allQuestions
                  .filter((q) => q.id !== question.id)
                  .map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            {question.conditionalDisplay && (
              <div className="space-y-3 pl-4 border-l-2">
                <Select
                  value={question.conditionalDisplay.operator}
                  onValueChange={(value: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty') =>
                    onChange({
                      conditionalDisplay: {
                        ...question.conditionalDisplay!,
                        operator: value,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="not_equals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="is_empty">Is Empty</SelectItem>
                    <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                  </SelectContent>
                </Select>

                {!['is_empty', 'is_not_empty'].includes(
                  question.conditionalDisplay.operator
                ) && (
                  <Input
                    value={question.conditionalDisplay.value || ''}
                    onChange={(e) =>
                      onChange({
                        conditionalDisplay: {
                          ...question.conditionalDisplay!,
                          value: e.target.value,
                        },
                      })
                    }
                    placeholder="Value to compare"
                  />
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Section Assignment */}
          <div>
            <Label>Section</Label>
            <Input
              value={question.section || ''}
              onChange={(e) => onChange({ section: e.target.value || undefined })}
              placeholder="e.g., contact_info, vehicle_details"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Group questions into sections for multi-step forms
            </p>
          </div>

          {/* Help Text */}
          <div>
            <Label>Help Text</Label>
            <Textarea
              value={question.helpText || ''}
              onChange={(e) => onChange({ helpText: e.target.value })}
              placeholder="Additional help information shown on hover"
            />
          </div>

          {/* Delete Button */}
          <Button variant="destructive" className="w-full" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Question
          </Button>
        </div>
      </ScrollArea>
    </>
  );
}

export default QuestionEditor;
