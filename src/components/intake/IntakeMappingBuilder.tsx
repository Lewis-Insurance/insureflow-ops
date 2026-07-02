// ============================================
// Intake Mapping Builder Component
// Visual UI for creating field mappings between intake questions and ACORD fields
// ============================================

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import type { IntakeQuestion, IntakeAcordMapping, TransformType } from '@/types/intake';
import type { AcordTemplate, FieldDefinition, TransformConfig } from '@/types/acord';
import {
  ArrowRight,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Link2,
  Unlink,
  Plus,
  Trash2,
  Settings2,
  Search,
  Check,
  X,
  AlertCircle,
  HelpCircle,
  Copy,
  FileText,
  Zap,
  RefreshCw,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface IntakeMappingBuilderProps {
  intakeQuestions: IntakeQuestion[];
  acordTemplates: AcordTemplate[];
  existingMappings: IntakeAcordMapping[];
  intakeTemplateId: string;
  onSaveMapping: (mapping: Omit<IntakeAcordMapping, 'id' | 'created_at'>) => Promise<void>;
  onDeleteMapping: (mappingId: string) => Promise<void>;
  onUpdateMapping: (mappingId: string, updates: Partial<IntakeAcordMapping>) => Promise<void>;
  isLoading?: boolean;
}

interface MappingEditorState {
  isOpen: boolean;
  mapping: Partial<IntakeAcordMapping> | null;
  isEditing: boolean;
  selectedQuestion: IntakeQuestion | null;
  selectedField: FieldDefinition | null;
}

interface TransformOption {
  type: TransformType;
  label: string;
  description: string;
  requiresConfig: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const TRANSFORM_OPTIONS: TransformOption[] = [
  { type: 'direct', label: 'Direct Copy', description: 'Copy value as-is', requiresConfig: false },
  { type: 'uppercase', label: 'Uppercase', description: 'Convert to uppercase', requiresConfig: false },
  { type: 'lowercase', label: 'Lowercase', description: 'Convert to lowercase', requiresConfig: false },
  { type: 'date_format', label: 'Date Format', description: 'Transform date format', requiresConfig: true },
  { type: 'phone_format', label: 'Phone Format', description: 'Format phone number', requiresConfig: true },
  { type: 'currency_format', label: 'Currency Format', description: 'Format currency value', requiresConfig: true },
  { type: 'boolean', label: 'Boolean', description: 'Map to checkbox/yes-no', requiresConfig: true },
  { type: 'lookup', label: 'Lookup Table', description: 'Map values using lookup', requiresConfig: true },
  { type: 'concatenate', label: 'Concatenate', description: 'Combine multiple fields', requiresConfig: true },
  { type: 'split', label: 'Split', description: 'Split value into parts', requiresConfig: true },
  { type: 'substring', label: 'Substring', description: 'Extract part of text', requiresConfig: true },
  { type: 'calculate', label: 'Calculate', description: 'Mathematical formula', requiresConfig: true },
  { type: 'conditional', label: 'Conditional', description: 'Value based on condition', requiresConfig: true },
  { type: 'format', label: 'Custom Format', description: 'Apply custom format', requiresConfig: true },
];

// ============================================
// COMPONENT
// ============================================

export function IntakeMappingBuilder({
  intakeQuestions,
  acordTemplates,
  existingMappings,
  intakeTemplateId,
  onSaveMapping,
  onDeleteMapping,
  onUpdateMapping,
  isLoading = false,
}: IntakeMappingBuilderProps) {
  const { toast } = useToast();
  const [searchQuestion, setSearchQuestion] = useState('');
  const [searchField, setSearchField] = useState('');
  const [selectedFormNumber, setSelectedFormNumber] = useState<string>(
    acordTemplates[0]?.form_number || ''
  );
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [editorState, setEditorState] = useState<MappingEditorState>({
    isOpen: false,
    mapping: null,
    isEditing: false,
    selectedQuestion: null,
    selectedField: null,
  });

  // Filter questions by search
  const filteredQuestions = useMemo(() => {
    if (!searchQuestion) return intakeQuestions;
    const lower = searchQuestion.toLowerCase();
    return intakeQuestions.filter(
      (q) =>
        q.label.toLowerCase().includes(lower) ||
        q.id.toLowerCase().includes(lower) ||
        q.type.toLowerCase().includes(lower)
    );
  }, [intakeQuestions, searchQuestion]);

  // Get selected ACORD template
  const selectedTemplate = useMemo(
    () => acordTemplates.find((t) => t.form_number === selectedFormNumber),
    [acordTemplates, selectedFormNumber]
  );

  // Filter fields by search
  const filteredFields = useMemo(() => {
    if (!selectedTemplate?.field_definitions) return [];
    if (!searchField) return selectedTemplate.field_definitions;
    const lower = searchField.toLowerCase();
    return selectedTemplate.field_definitions.filter(
      (f) =>
        f.fieldName.toLowerCase().includes(lower) ||
        f.label?.toLowerCase().includes(lower) ||
        f.section?.toLowerCase().includes(lower)
    );
  }, [selectedTemplate, searchField]);

  // Group fields by section
  const fieldsBySection = useMemo(() => {
    const grouped: Record<string, FieldDefinition[]> = {};
    filteredFields.forEach((field) => {
      const section = field.section || 'Other';
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(field);
    });
    return grouped;
  }, [filteredFields]);

  // Get mappings for selected form
  const formMappings = useMemo(
    () => existingMappings.filter((m) => m.acord_form_number === selectedFormNumber),
    [existingMappings, selectedFormNumber]
  );

  // Check if question is mapped
  const isMapped = useCallback(
    (questionId: string, formNumber: string) => {
      return existingMappings.some(
        (m) => m.intake_question_id === questionId && m.acord_form_number === formNumber
      );
    },
    [existingMappings]
  );

  // Get mapping for field
  const getMappingForField = useCallback(
    (fieldName: string) => {
      return formMappings.find((m) => m.acord_field_name === fieldName);
    },
    [formMappings]
  );

  // Get question by ID
  const getQuestionById = useCallback(
    (questionId: string) => {
      return intakeQuestions.find((q) => q.id === questionId);
    },
    [intakeQuestions]
  );

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  // Open mapping editor
  const openMappingEditor = (question: IntakeQuestion, field?: FieldDefinition) => {
    const existingMapping = field ? getMappingForField(field.fieldName) : null;

    setEditorState({
      isOpen: true,
      mapping: existingMapping || {
        intake_template_id: intakeTemplateId,
        intake_question_id: question.id,
        acord_form_number: selectedFormNumber,
        acord_field_name: field?.fieldName || '',
        transform_type: 'direct',
        transform_config: {},
        is_repeater_field: question.type === 'repeater',
      },
      isEditing: !!existingMapping,
      selectedQuestion: question,
      selectedField: field || null,
    });
  };

  // Close mapping editor
  const closeMappingEditor = () => {
    setEditorState({
      isOpen: false,
      mapping: null,
      isEditing: false,
      selectedQuestion: null,
      selectedField: null,
    });
  };

  // Save mapping
  const handleSaveMapping = async () => {
    if (!editorState.mapping) return;

    const mapping = editorState.mapping;
    if (!mapping.acord_field_name) {
      toast({
        title: 'Missing field',
        description: 'Please select an ACORD field to map to',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (editorState.isEditing && 'id' in mapping && mapping.id) {
        await onUpdateMapping(mapping.id, mapping);
        toast({ title: 'Mapping updated', description: 'Field mapping has been updated' });
      } else {
        await onSaveMapping(mapping as Omit<IntakeAcordMapping, 'id' | 'created_at'>);
        toast({ title: 'Mapping created', description: 'Field mapping has been created' });
      }
      closeMappingEditor();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save mapping',
        variant: 'destructive',
      });
    }
  };

  // Delete mapping
  const handleDeleteMapping = async (mappingId: string) => {
    try {
      await onDeleteMapping(mappingId);
      toast({ title: 'Mapping deleted', description: 'Field mapping has been removed' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete mapping',
        variant: 'destructive',
      });
    }
  };

  // Update mapping in editor
  const updateMappingInEditor = (updates: Partial<IntakeAcordMapping>) => {
    setEditorState((prev) => ({
      ...prev,
      mapping: prev.mapping ? { ...prev.mapping, ...updates } : null,
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel - Intake Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Intake Questions
          </CardTitle>
          <CardDescription>
            Select a question to map to an ACORD field
          </CardDescription>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={searchQuestion}
              onChange={(e) => setSearchQuestion(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2 pr-4">
              {filteredQuestions.map((question) => {
                const mapped = isMapped(question.id, selectedFormNumber);
                return (
                  <div
                    key={question.id}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                      mapped ? 'border-success/40 bg-success/10' : ''
                    }`}
                    onClick={() => openMappingEditor(question)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{question.label}</span>
                          {question.required && (
                            <Badge variant="outline" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">
                            {question.type}
                          </Badge>
                          <span className="font-mono text-xs">{question.id}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {mapped && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Check className="h-4 w-4 text-success" />
                            </TooltipTrigger>
                            <TooltipContent>Mapped to ACORD {selectedFormNumber}</TooltipContent>
                          </Tooltip>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredQuestions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No questions found
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right Panel - ACORD Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            ACORD Fields
          </CardTitle>
          <CardDescription>
            Target fields for mapping
          </CardDescription>
          <div className="flex gap-2">
            <Select value={selectedFormNumber} onValueChange={setSelectedFormNumber}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select form" />
              </SelectTrigger>
              <SelectContent>
                {acordTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.form_number}>
                    ACORD {template.form_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search fields..."
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-2 pr-4">
              {Object.entries(fieldsBySection).map(([section, fields]) => (
                <Collapsible
                  key={section}
                  open={expandedSections.includes(section)}
                  onOpenChange={() => toggleSection(section)}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      {expandedSections.includes(section) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium">{section}</span>
                    </div>
                    <Badge variant="secondary">{fields.length} fields</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="ml-6 space-y-2">
                      {fields.map((field) => {
                        const mapping = getMappingForField(field.fieldName);
                        const mappedQuestion = mapping
                          ? getQuestionById(mapping.intake_question_id)
                          : null;

                        return (
                          <div
                            key={field.fieldName}
                            className={`rounded-lg border p-3 ${
                              mapping
                                ? 'border-success/40 bg-success/10'
                                : ''
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {field.label || field.fieldName}
                                </div>
                                <div className="font-mono text-xs text-muted-foreground">
                                  {field.fieldName}
                                </div>
                                {field.required && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs mt-1 border-warning/40 text-warning"
                                  >
                                    Required
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {mapping && mappedQuestion && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge
                                        variant="secondary"
                                        className="cursor-pointer"
                                        onClick={() =>
                                          openMappingEditor(mappedQuestion, field)
                                        }
                                      >
                                        <Link2 className="h-3 w-3 mr-1" />
                                        {mappedQuestion.label.slice(0, 15)}
                                        {mappedQuestion.label.length > 15 ? '...' : ''}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-sm">
                                        <div>Mapped from: {mappedQuestion.label}</div>
                                        <div>Transform: {mapping.transform_type}</div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {mapping && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleDeleteMapping(mapping.id)}
                                  >
                                    <Unlink className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}

              {Object.keys(fieldsBySection).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedTemplate
                    ? 'No fields found'
                    : 'Select an ACORD form to view fields'}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Mapping Summary */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Mapping Summary
          </CardTitle>
          <CardDescription>
            {formMappings.length} mapping{formMappings.length !== 1 ? 's' : ''} configured
            for ACORD {selectedFormNumber}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {formMappings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {formMappings.map((mapping) => {
                const question = getQuestionById(mapping.intake_question_id);
                return (
                  <div
                    key={mapping.id}
                    className="rounded-lg border p-3 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm truncate">
                          {question?.label || mapping.intake_question_id}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-mono truncate">
                          {mapping.acord_field_name}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {mapping.transform_type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => question && openMappingEditor(question)}
                      >
                        <Settings2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleDeleteMapping(mapping.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No mappings configured. Click on an intake question to start mapping.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mapping Editor Dialog */}
      <Dialog open={editorState.isOpen} onOpenChange={(open) => !open && closeMappingEditor()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editorState.isEditing ? 'Edit' : 'Create'} Field Mapping
            </DialogTitle>
            <DialogDescription>
              Map intake question to ACORD field with optional transformation
            </DialogDescription>
          </DialogHeader>

          {editorState.mapping && editorState.selectedQuestion && (
            <div className="space-y-6">
              {/* Source Question */}
              <div className="rounded-lg border p-4 bg-muted/50">
                <Label className="text-sm font-medium">Source Question</Label>
                <div className="mt-2">
                  <div className="font-medium">{editorState.selectedQuestion.label}</div>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                      {editorState.selectedQuestion.type}
                    </Badge>
                    <span className="font-mono text-xs">
                      {editorState.selectedQuestion.id}
                    </span>
                  </div>
                </div>
              </div>

              {/* Target Field Selection */}
              <div className="space-y-2">
                <Label>Target ACORD Field</Label>
                <Select
                  value={editorState.mapping.acord_field_name || ''}
                  onValueChange={(value) =>
                    updateMappingInEditor({ acord_field_name: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target field" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTemplate?.field_definitions?.map((field) => (
                      <SelectItem key={field.fieldName} value={field.fieldName}>
                        <div className="flex items-center gap-2">
                          <span>{field.label || field.fieldName}</span>
                          {field.required && (
                            <Badge variant="outline" className="text-xs">
                              Required
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transform Type */}
              <div className="space-y-2">
                <Label>Transform Type</Label>
                <Select
                  value={editorState.mapping.transform_type || 'direct'}
                  onValueChange={(value) =>
                    updateMappingInEditor({
                      transform_type: value as TransformType,
                      transform_config: {},
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFORM_OPTIONS.map((option) => (
                      <SelectItem key={option.type} value={option.type}>
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transform Configuration */}
              {editorState.mapping.transform_type &&
                TRANSFORM_OPTIONS.find(
                  (o) => o.type === editorState.mapping?.transform_type
                )?.requiresConfig && (
                  <TransformConfigEditor
                    transformType={editorState.mapping.transform_type}
                    config={editorState.mapping.transform_config || {}}
                    onChange={(config) => updateMappingInEditor({ transform_config: config })}
                    sourceQuestion={editorState.selectedQuestion}
                    allQuestions={intakeQuestions}
                  />
                )}

              {/* Preview */}
              <div className="rounded-lg border border-info/30 p-4 bg-info/10">
                <div className="flex items-center gap-2 text-sm font-medium text-info">
                  <HelpCircle className="h-4 w-4" />
                  Mapping Preview
                </div>
                <div className="mt-2 text-sm text-info">
                  <span className="font-medium">{editorState.selectedQuestion.label}</span>
                  <ArrowRight className="inline h-3 w-3 mx-2" />
                  <span className="font-mono">
                    {editorState.mapping.acord_field_name || '(select field)'}
                  </span>
                  {editorState.mapping.transform_type !== 'direct' && (
                    <span className="ml-2 text-muted-foreground">
                      via {editorState.mapping.transform_type}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeMappingEditor}>
              Cancel
            </Button>
            <Button onClick={handleSaveMapping} disabled={isLoading}>
              {isLoading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {editorState.isEditing ? 'Update' : 'Create'} Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// TRANSFORM CONFIG EDITOR
// ============================================

interface TransformConfigEditorProps {
  transformType: TransformType;
  config: TransformConfig;
  onChange: (config: TransformConfig) => void;
  sourceQuestion: IntakeQuestion;
  allQuestions: IntakeQuestion[];
}

function TransformConfigEditor({
  transformType,
  config,
  onChange,
  sourceQuestion,
  allQuestions,
}: TransformConfigEditorProps) {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  switch (transformType) {
    case 'date_format':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Date Format Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Input Format</Label>
              <Select
                value={config.inputFormat || 'auto'}
                onValueChange={(v) => updateConfig('inputFormat', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Output Format</Label>
              <Select
                value={config.outputFormat || 'MM/DD/YYYY'}
                onValueChange={(v) => updateConfig('outputFormat', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="MM-DD-YYYY">MM-DD-YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="MMDDYYYY">MMDDYYYY (no separators)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case 'phone_format':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Phone Format Configuration</h4>
          <div>
            <Label>Output Format</Label>
            <Select
              value={config.format || '(###) ###-####'}
              onValueChange={(v) => updateConfig('format', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="(###) ###-####">(###) ###-####</SelectItem>
                <SelectItem value="###-###-####">###-###-####</SelectItem>
                <SelectItem value="##########">########## (no formatting)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'currency_format':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Currency Format Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Decimal Places</Label>
              <Select
                value={String(config.decimals ?? 2)}
                onValueChange={(v) => updateConfig('decimals', parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 (whole dollars)</SelectItem>
                  <SelectItem value="2">2 (standard)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Include Symbol</Label>
              <Select
                value={String(config.includeSymbol ?? false)}
                onValueChange={(v) => updateConfig('includeSymbol', v === 'true')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No symbol</SelectItem>
                  <SelectItem value="true">Include $</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case 'boolean':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Boolean Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>True Value</Label>
              <Input
                value={config.trueValue || 'X'}
                onChange={(e) => updateConfig('trueValue', e.target.value)}
                placeholder="X"
              />
            </div>
            <div>
              <Label>False Value</Label>
              <Input
                value={config.falseValue || ''}
                onChange={(e) => updateConfig('falseValue', e.target.value)}
                placeholder="(empty)"
              />
            </div>
          </div>
          <div>
            <Label>Match Value (triggers true)</Label>
            <Input
              value={config.matchValue || ''}
              onChange={(e) => updateConfig('matchValue', e.target.value)}
              placeholder="Value that triggers 'true'"
            />
          </div>
        </div>
      );

    case 'lookup':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Lookup Table</h4>
          <p className="text-sm text-muted-foreground">
            Map input values to output values
          </p>
          <div className="space-y-2">
            {Object.entries(config.lookupTable || {}).map(([key, value], idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  value={key}
                  onChange={(e) => {
                    const newTable = { ...config.lookupTable };
                    delete newTable[key];
                    newTable[e.target.value] = value as string;
                    updateConfig('lookupTable', newTable);
                  }}
                  placeholder="Input value"
                  className="flex-1"
                />
                <ArrowRight className="h-9 w-4 shrink-0 text-muted-foreground" />
                <Input
                  value={value as string}
                  onChange={(e) => {
                    updateConfig('lookupTable', {
                      ...config.lookupTable,
                      [key]: e.target.value,
                    });
                  }}
                  placeholder="Output value"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newTable = { ...config.lookupTable };
                    delete newTable[key];
                    updateConfig('lookupTable', newTable);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateConfig('lookupTable', { ...config.lookupTable, '': '' })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </div>
          <div>
            <Label>Default Value (if not found)</Label>
            <Input
              value={config.defaultValue || ''}
              onChange={(e) => updateConfig('defaultValue', e.target.value)}
              placeholder="Default if no match"
            />
          </div>
        </div>
      );

    case 'concatenate':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Concatenate Configuration</h4>
          <div>
            <Label>Additional Fields to Concatenate</Label>
            <Select
              value=""
              onValueChange={(v) =>
                updateConfig('additionalFields', [...(config.additionalFields || []), v])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Add field" />
              </SelectTrigger>
              <SelectContent>
                {allQuestions
                  .filter((q) => q.id !== sourceQuestion.id)
                  .filter((q) => !config.additionalFields?.includes(q.id))
                  .map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {config.additionalFields?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{sourceQuestion.label}</Badge>
              {config.additionalFields.map((fieldId: string) => {
                const q = allQuestions.find((x) => x.id === fieldId);
                return (
                  <Badge key={fieldId} variant="secondary" className="cursor-pointer">
                    {q?.label || fieldId}
                    <X
                      className="ml-1 h-3 w-3"
                      onClick={() =>
                        updateConfig(
                          'additionalFields',
                          config.additionalFields.filter((f: string) => f !== fieldId)
                        )
                      }
                    />
                  </Badge>
                );
              })}
            </div>
          )}
          <div>
            <Label>Separator</Label>
            <Input
              value={config.separator ?? ' '}
              onChange={(e) => updateConfig('separator', e.target.value)}
              placeholder="Space, comma, etc."
            />
          </div>
        </div>
      );

    case 'split':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Split Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Split By</Label>
              <Input
                value={config.splitBy || ' '}
                onChange={(e) => updateConfig('splitBy', e.target.value)}
                placeholder="Character to split on"
              />
            </div>
            <div>
              <Label>Take Part</Label>
              <Select
                value={String(config.partIndex ?? 0)}
                onValueChange={(v) => updateConfig('partIndex', parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">First</SelectItem>
                  <SelectItem value="1">Second</SelectItem>
                  <SelectItem value="2">Third</SelectItem>
                  <SelectItem value="-1">Last</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case 'substring':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Substring Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Position</Label>
              <Input
                type="number"
                value={config.start ?? 0}
                onChange={(e) => updateConfig('start', parseInt(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <Label>Length</Label>
              <Input
                type="number"
                value={config.length || ''}
                onChange={(e) =>
                  updateConfig('length', e.target.value ? parseInt(e.target.value) : undefined)
                }
                placeholder="All remaining"
              />
            </div>
          </div>
        </div>
      );

    case 'calculate':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Calculation Configuration</h4>
          <div>
            <Label>Formula</Label>
            <Input
              value={config.formula || ''}
              onChange={(e) => updateConfig('formula', e.target.value)}
              placeholder="e.g., {field1} + {field2} * 0.1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use {'{field_id}'} to reference fields. Supports +, -, *, /, ()
            </p>
          </div>
        </div>
      );

    case 'conditional':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Conditional Configuration</h4>
          <div>
            <Label>Condition Field</Label>
            <Select
              value={config.conditionField || sourceQuestion.id}
              onValueChange={(v) => updateConfig('conditionField', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allQuestions.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Operator</Label>
              <Select
                value={config.operator || 'equals'}
                onValueChange={(v) => updateConfig('operator', v)}
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
            </div>
            <div>
              <Label>Compare Value</Label>
              <Input
                value={config.compareValue || ''}
                onChange={(e) => updateConfig('compareValue', e.target.value)}
                placeholder="Value to compare"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>If True</Label>
              <Input
                value={config.trueValue || ''}
                onChange={(e) => updateConfig('trueValue', e.target.value)}
                placeholder="Value when true"
              />
            </div>
            <div>
              <Label>If False</Label>
              <Input
                value={config.falseValue || ''}
                onChange={(e) => updateConfig('falseValue', e.target.value)}
                placeholder="Value when false"
              />
            </div>
          </div>
        </div>
      );

    case 'format':
      return (
        <div className="space-y-4 rounded-lg border p-4">
          <h4 className="text-sm font-medium">Custom Format Configuration</h4>
          <div>
            <Label>Format Template</Label>
            <Input
              value={config.template || ''}
              onChange={(e) => updateConfig('template', e.target.value)}
              placeholder="e.g., {value} Inc."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use {'{value}'} for the input value
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default IntakeMappingBuilder;
