// ============================================
// Intake Builder Page
// Drag-and-drop form builder for intake templates
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useIntakeTemplates } from '@/hooks/useIntakeTemplates';
import { useAcordTemplates } from '@/hooks/useAcordTemplates';
import { IntakeMappingBuilder } from '@/components/intake/IntakeMappingBuilder';
import { QuestionEditor } from '@/components/intake/QuestionEditor';
import { SettingsEditor } from '@/components/intake/SettingsEditor';
import { BrandingEditor } from '@/components/intake/BrandingEditor';
import type {
  IntakeTemplate,
  IntakeQuestion,
  IntakeType,
  QuestionType,
  IntakeAcordMapping,
  SelectOption,
  ConditionalDisplay,
  QUESTION_TYPE_INFO,
} from '@/types/intake';
import type { AcordTemplate } from '@/types/acord';
import {
  GripVertical,
  Plus,
  Trash2,
  Copy,
  Settings,
  Eye,
  Save,
  ArrowLeft,
  Upload,
  Link2,
  FileText,
  CheckSquare,
  Hash,
  Calendar,
  Type,
  AlignLeft,
  ChevronDown,
  Circle,
  Upload as UploadIcon,
  PenTool,
  MapPin,
  Phone,
  Mail,
  Lock,
  Building,
  Car,
  Heading,
  Info,
  RefreshCw,
  Layers,
  Palette,
  Zap,
  ExternalLink,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface QuestionTypeOption {
  type: QuestionType;
  label: string;
  icon: React.ReactNode;
  hasOptions: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const QUESTION_TYPES: QuestionTypeOption[] = [
  { type: 'text', label: 'Short Text', icon: <Type className="h-4 w-4" />, hasOptions: false },
  { type: 'textarea', label: 'Long Text', icon: <AlignLeft className="h-4 w-4" />, hasOptions: false },
  { type: 'number', label: 'Number', icon: <Hash className="h-4 w-4" />, hasOptions: false },
  { type: 'currency', label: 'Currency', icon: <span className="text-sm font-bold">$</span>, hasOptions: false },
  { type: 'date', label: 'Date', icon: <Calendar className="h-4 w-4" />, hasOptions: false },
  { type: 'select', label: 'Dropdown', icon: <ChevronDown className="h-4 w-4" />, hasOptions: true },
  { type: 'multi_select', label: 'Multi-Select', icon: <CheckSquare className="h-4 w-4" />, hasOptions: true },
  { type: 'checkbox', label: 'Checkbox', icon: <CheckSquare className="h-4 w-4" />, hasOptions: false },
  { type: 'radio', label: 'Radio Buttons', icon: <Circle className="h-4 w-4" />, hasOptions: true },
  { type: 'file', label: 'File Upload', icon: <UploadIcon className="h-4 w-4" />, hasOptions: false },
  { type: 'signature', label: 'Signature', icon: <PenTool className="h-4 w-4" />, hasOptions: false },
  { type: 'address', label: 'Address', icon: <MapPin className="h-4 w-4" />, hasOptions: false },
  { type: 'phone', label: 'Phone Number', icon: <Phone className="h-4 w-4" />, hasOptions: false },
  { type: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, hasOptions: false },
  { type: 'ssn', label: 'SSN', icon: <Lock className="h-4 w-4" />, hasOptions: false },
  { type: 'ein', label: 'EIN', icon: <Building className="h-4 w-4" />, hasOptions: false },
  { type: 'vin', label: 'VIN', icon: <Car className="h-4 w-4" />, hasOptions: false },
  { type: 'section_header', label: 'Section Header', icon: <Heading className="h-4 w-4" />, hasOptions: false },
  { type: 'info_text', label: 'Info Text', icon: <Info className="h-4 w-4" />, hasOptions: false },
  { type: 'repeater', label: 'Repeating Section', icon: <Plus className="h-4 w-4" />, hasOptions: false },
];

const INTAKE_TYPES: { value: IntakeType; label: string }[] = [
  { value: 'acord', label: 'ACORD Forms' },
  { value: 'general', label: 'General Intake' },
  { value: 'fnol', label: 'First Notice of Loss' },
  { value: 'survey', label: 'Survey' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'endorsement', label: 'Endorsement' },
];

// ============================================
// COMPONENT
// ============================================

export function IntakeBuilder() {
  const { id: templateId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    templates,
    loading,
    fetchTemplates,
    fetchTemplateById,
    createTemplate,
    updateTemplate,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    publishTemplate,
    unpublishTemplate,
    fetchMappings,
    createMapping,
    updateMapping,
    deleteMapping,
  } = useIntakeTemplates();

  const { templates: acordTemplates, fetchTemplates: fetchAcordTemplates } = useAcordTemplates();

  const [template, setTemplate] = useState<IntakeTemplate | null>(null);
  const [mappings, setMappings] = useState<IntakeAcordMapping[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('questions');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(!templateId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // New template form state
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    intake_type: 'acord' as IntakeType,
  });

  // Load template data
  useEffect(() => {
    if (templateId) {
      loadTemplate(templateId);
      loadMappings(templateId);
    }
    fetchAcordTemplates();
  }, [templateId]);

  const loadTemplate = async (id: string) => {
    const data = await fetchTemplateById(id);
    if (data) {
      setTemplate(data);
    } else {
      toast({
        title: 'Template not found',
        description: 'The requested template could not be loaded',
        variant: 'destructive',
      });
      navigate('/intake-templates');
    }
  };

  const loadMappings = async (id: string) => {
    const data = await fetchMappings(id);
    setMappings(data);
  };

  // Get selected question
  const selectedQuestion = useMemo(() => {
    if (!selectedQuestionId || !template) return null;
    return template.questions.find(q => q.id === selectedQuestionId) || null;
  }, [selectedQuestionId, template]);

  // Handle drag end
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !template) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    if (sourceIndex === destIndex) return;

    const newQuestions = Array.from(template.questions);
    const [removed] = newQuestions.splice(sourceIndex, 1);
    newQuestions.splice(destIndex, 0, removed);

    // Update order
    const reorderedQuestions = newQuestions.map((q, index) => ({
      ...q,
      order: index,
    }));

    setTemplate({ ...template, questions: reorderedQuestions });
    setIsDirty(true);
  };

  // Add new question
  const handleAddQuestion = (type: QuestionType) => {
    if (!template) return;

    const typeInfo = QUESTION_TYPES.find(t => t.type === type);
    const newQuestion: IntakeQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      label: `New ${typeInfo?.label || 'Question'}`,
      required: false,
      order: template.questions.length,
      options: typeInfo?.hasOptions ? [{ value: 'option1', label: 'Option 1' }] : undefined,
    };

    setTemplate({
      ...template,
      questions: [...template.questions, newQuestion],
    });
    setSelectedQuestionId(newQuestion.id);
    setIsDirty(true);
  };

  // Update question
  const handleUpdateQuestion = (questionId: string, updates: Partial<IntakeQuestion>) => {
    if (!template) return;

    setTemplate({
      ...template,
      questions: template.questions.map(q =>
        q.id === questionId ? { ...q, ...updates } : q
      ),
    });
    setIsDirty(true);
  };

  // Delete question
  const handleDeleteQuestion = (questionId: string) => {
    if (!template) return;

    setTemplate({
      ...template,
      questions: template.questions
        .filter(q => q.id !== questionId)
        .map((q, index) => ({ ...q, order: index })),
    });
    setSelectedQuestionId(null);
    setShowDeleteConfirm(null);
    setIsDirty(true);
  };

  // Duplicate question
  const handleDuplicateQuestion = (questionId: string) => {
    if (!template) return;

    const original = template.questions.find(q => q.id === questionId);
    if (!original) return;

    const duplicate: IntakeQuestion = {
      ...original,
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label: `${original.label} (Copy)`,
      order: template.questions.length,
    };

    setTemplate({
      ...template,
      questions: [...template.questions, duplicate],
    });
    setSelectedQuestionId(duplicate.id);
    setIsDirty(true);
  };

  // Save template
  const handleSave = async () => {
    if (!template) return;

    setIsSaving(true);
    try {
      const success = await updateTemplate(template.id, {
        name: template.name,
        description: template.description,
        intake_type: template.intake_type,
        questions: template.questions,
        settings: template.settings,
        branding: template.branding,
        dynamic_sections: template.dynamic_sections,
      });

      if (success) {
        setIsDirty(false);
        toast({
          title: 'Saved',
          description: 'Template changes have been saved',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Create new template
  const handleCreateTemplate = async () => {
    if (!newTemplate.name) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for the template',
        variant: 'destructive',
      });
      return;
    }

    const created = await createTemplate({
      name: newTemplate.name,
      description: newTemplate.description,
      intake_type: newTemplate.intake_type,
    });

    if (created) {
      setShowNewTemplateDialog(false);
      navigate(`/intake-builder/${created.id}`);
    }
  };

  // Handle mapping operations
  const handleSaveMapping = async (mapping: Omit<IntakeAcordMapping, 'id' | 'created_at'>) => {
    const created = await createMapping(mapping);
    if (created) {
      setMappings(prev => [...prev, created]);
    }
  };

  const handleUpdateMapping = async (mappingId: string, updates: Partial<IntakeAcordMapping>) => {
    const success = await updateMapping(mappingId, updates);
    if (success) {
      setMappings(prev => prev.map(m => (m.id === mappingId ? { ...m, ...updates } : m)));
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    const success = await deleteMapping(mappingId);
    if (success) {
      setMappings(prev => prev.filter(m => m.id !== mappingId));
    }
  };

  // Render question in list
  const renderQuestion = (question: IntakeQuestion, index: number) => {
    const typeInfo = QUESTION_TYPES.find(t => t.type === question.type);
    const isSelected = selectedQuestionId === question.id;

    return (
      <Draggable key={question.id} draggableId={question.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`rounded-lg border p-3 mb-2 cursor-pointer transition-all ${
              isSelected
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : 'hover:border-primary/50'
            } ${snapshot.isDragging ? 'shadow-lg' : ''}`}
            onClick={() => setSelectedQuestionId(question.id)}
          >
            <div className="flex items-center gap-2">
              <div
                {...provided.dragHandleProps}
                className="cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="shrink-0">{typeInfo?.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{question.label}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {typeInfo?.label}
                  </Badge>
                  {question.required && (
                    <Badge variant="outline" className="text-xs">
                      Required
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicateQuestion(question.id);
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(question.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  if (loading && !template) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/intake-templates')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {template && (
              <div>
                <Input
                  value={template.name}
                  onChange={(e) => {
                    setTemplate({ ...template, name: e.target.value });
                    setIsDirty(true);
                  }}
                  className="text-lg font-semibold border-none bg-transparent px-0 focus-visible:ring-0"
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">
                    {INTAKE_TYPES.find(t => t.value === template.intake_type)?.label}
                  </Badge>
                  <span>{template.questions.length} questions</span>
                  {isDirty && <Badge variant="outline">Unsaved changes</Badge>}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowPreview(true)}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            {template && (
              <Button
                variant="outline"
                onClick={() =>
                  template.is_published
                    ? unpublishTemplate(template.id)
                    : publishTemplate(template.id)
                }
              >
                {template.is_published ? 'Unpublish' : 'Publish'}
              </Button>
            )}
            <Button onClick={handleSave} disabled={!isDirty || isSaving}>
              {isSaving ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </div>
      </div>

      {template && (
        <div className="container mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="questions" className="gap-2">
                <FileText className="h-4 w-4" />
                Questions
              </TabsTrigger>
              <TabsTrigger value="mappings" className="gap-2">
                <Link2 className="h-4 w-4" />
                ACORD Mappings
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-2">
                <Palette className="h-4 w-4" />
                Branding
              </TabsTrigger>
            </TabsList>

            {/* Questions Tab */}
            <TabsContent value="questions">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Question Type Palette */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Add Question</CardTitle>
                    <CardDescription>
                      Click to add a new question
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      {QUESTION_TYPES.map((type) => (
                        <Button
                          key={type.type}
                          variant="outline"
                          size="sm"
                          className="justify-start gap-2"
                          onClick={() => handleAddQuestion(type.type)}
                        >
                          {type.icon}
                          <span className="truncate">{type.label}</span>
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Question List */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Questions</CardTitle>
                    <CardDescription>
                      Drag to reorder, click to edit
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DragDropContext onDragEnd={handleDragEnd}>
                      <Droppable droppableId="questions">
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="min-h-[200px]"
                          >
                            {template.questions.length > 0 ? (
                              template.questions.map((question, index) =>
                                renderQuestion(question, index)
                              )
                            ) : (
                              <div className="text-center py-12 text-muted-foreground">
                                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No questions yet</p>
                                <p className="text-sm">
                                  Add questions from the palette on the left
                                </p>
                              </div>
                            )}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  </CardContent>
                </Card>
              </div>

              {/* Question Editor Sheet */}
              <Sheet
                open={!!selectedQuestion}
                onOpenChange={(open) => !open && setSelectedQuestionId(null)}
              >
                <SheetContent className="w-[500px] sm:max-w-[500px]">
                  {selectedQuestion && (
                    <QuestionEditor
                      question={selectedQuestion}
                      allQuestions={template.questions}
                      questionTypes={QUESTION_TYPES}
                      onChange={(updates) =>
                        handleUpdateQuestion(selectedQuestion.id, updates)
                      }
                      onDelete={() => setShowDeleteConfirm(selectedQuestion.id)}
                    />
                  )}
                </SheetContent>
              </Sheet>
            </TabsContent>

            {/* Mappings Tab */}
            <TabsContent value="mappings">
              <IntakeMappingBuilder
                intakeQuestions={template.questions}
                acordTemplates={acordTemplates}
                existingMappings={mappings}
                intakeTemplateId={template.id}
                onSaveMapping={handleSaveMapping}
                onDeleteMapping={handleDeleteMapping}
                onUpdateMapping={handleUpdateMapping}
              />
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <SettingsEditor
                settings={template.settings}
                onChange={(settings) => {
                  setTemplate({ ...template, settings });
                  setIsDirty(true);
                }}
              />
            </TabsContent>

            {/* Branding Tab */}
            <TabsContent value="branding">
              <BrandingEditor
                branding={template.branding}
                onChange={(branding) => {
                  setTemplate({ ...template, branding });
                  setIsDirty(true);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* New Template Dialog */}
      <Dialog open={showNewTemplateDialog} onOpenChange={setShowNewTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Intake Template</DialogTitle>
            <DialogDescription>
              Start building a new intake form
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={newTemplate.name}
                onChange={(e) =>
                  setNewTemplate({ ...newTemplate, name: e.target.value })
                }
                placeholder="e.g., Commercial Auto Application"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newTemplate.description}
                onChange={(e) =>
                  setNewTemplate({ ...newTemplate, description: e.target.value })
                }
                placeholder="Brief description of this intake form"
              />
            </div>
            <div>
              <Label>Intake Type</Label>
              <Select
                value={newTemplate.intake_type}
                onValueChange={(value: IntakeType) =>
                  setNewTemplate({ ...newTemplate, intake_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTAKE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/intake-templates')}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate}>Create Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!showDeleteConfirm}
        onOpenChange={(open) => !open && setShowDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any mappings to this question will
              also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => showDeleteConfirm && handleDeleteQuestion(showDeleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default IntakeBuilder;
