/**
 * WorkflowBuilder - Visual Workflow Editor
 *
 * Main component for building and editing automation workflows.
 * Supports multi-stage workflows with drag-and-drop reordering,
 * trigger configuration, and goal tracking.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useWorkflow,
  useWorkflowMutations,
  useWorkflowStages,
  useWorkflowTemplates,
  useCreateFromTemplate,
  WorkflowStatus,
  TriggerType,
  AutomationWorkflowStage,
} from '@/hooks/useAutomationWorkflows';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import {
  Plus,
  Save,
  ArrowLeft,
  Mail,
  MessageSquare,
  CheckSquare,
  Webhook,
  GripVertical,
  Trash2,
  Clock,
  Edit,
  Eye,
  EyeOff,
  Target,
  Zap,
  Filter,
  Play,
  Pause,
  Copy,
  Settings,
  BarChart3,
  Users,
  Calendar,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { WorkflowStageModal } from './WorkflowStageModal';
import { WorkflowTriggerConfig } from './WorkflowTriggerConfig';
import { WorkflowGoalConfig } from './WorkflowGoalConfig';
import { WorkflowPreview } from './WorkflowPreview';
import { WorkflowTemplateSelector } from './WorkflowTemplateSelector';

interface WorkflowStageUI extends AutomationWorkflowStage {
  ui_id: string;
}

export function WorkflowBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditMode = !!id;

  // Data hooks
  const { data: existingWorkflow, isLoading } = useWorkflow(id);
  const { data: existingStages } = useWorkflowStages(id);
  const { createWorkflow, updateWorkflow, activateWorkflow, pauseWorkflow } = useWorkflowMutations();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workflowType, setWorkflowType] = useState('custom');
  const [triggerType, setTriggerType] = useState<TriggerType>('manual');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [filterConditions, setFilterConditions] = useState<Record<string, unknown>>({});
  const [goalType, setGoalType] = useState<string | null>(null);
  const [goalConfig, setGoalConfig] = useState<Record<string, unknown>>({});
  const [stages, setStages] = useState<WorkflowStageUI[]>([]);
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState('builder');

  // Modal state
  const [editingStage, setEditingStage] = useState<WorkflowStageUI | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(!isEditMode);

  // Load existing workflow data
  useEffect(() => {
    if (existingWorkflow) {
      setName(existingWorkflow.name);
      setDescription(existingWorkflow.description || '');
      setWorkflowType(existingWorkflow.workflow_type);
      setTriggerType(existingWorkflow.trigger_type);
      setTriggerConfig(existingWorkflow.trigger_config || {});
      setFilterConditions(existingWorkflow.filter_conditions || {});
      setGoalType(existingWorkflow.goal_type);
      setGoalConfig(existingWorkflow.goal_config || {});
      setStatus(existingWorkflow.status);
      setShowTemplateSelector(false);
    }
  }, [existingWorkflow]);

  // Load existing stages
  useEffect(() => {
    if (existingStages) {
      const stagesWithUI = existingStages.map((stage, index) => ({
        ...stage,
        ui_id: `stage-${stage.id || index}`,
      }));
      setStages(stagesWithUI);
    }
  }, [existingStages]);

  // Drag and drop handler
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(stages);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedStages = items.map((stage, index) => ({
      ...stage,
      stage_order: index,
    }));

    setStages(updatedStages);
  };

  // Stage handlers
  const handleAddStage = () => {
    const newStage: WorkflowStageUI = {
      ui_id: `stage-${Date.now()}`,
      id: '',
      workflow_id: id || '',
      name: '',
      stage_order: stages.length,
      action_type: 'send_email',
      action_config: {},
      delay_value: stages.length === 0 ? 0 : 1,
      delay_unit: 'days',
      conditions: null,
      exit_conditions: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setEditingStage(newStage);
    setIsStageModalOpen(true);
  };

  const handleEditStage = (stage: WorkflowStageUI) => {
    setEditingStage(stage);
    setIsStageModalOpen(true);
  };

  const handleDeleteStage = (stageId: string) => {
    const updatedStages = stages
      .filter((s) => s.ui_id !== stageId)
      .map((stage, index) => ({
        ...stage,
        stage_order: index,
      }));
    setStages(updatedStages);
  };

  const handleSaveStage = (stage: WorkflowStageUI) => {
    const existingIndex = stages.findIndex((s) => s.ui_id === stage.ui_id);
    if (existingIndex >= 0) {
      const newStages = [...stages];
      newStages[existingIndex] = stage;
      setStages(newStages);
    } else {
      setStages([...stages, stage]);
    }
    setIsStageModalOpen(false);
    setEditingStage(null);
  };

  const handleDuplicateStage = (stage: WorkflowStageUI) => {
    const duplicatedStage: WorkflowStageUI = {
      ...stage,
      ui_id: `stage-${Date.now()}`,
      id: '',
      name: `${stage.name} (Copy)`,
      stage_order: stages.length,
    };
    setStages([...stages, duplicatedStage]);
    toast({
      title: 'Stage duplicated',
      description: 'The stage has been copied to the end of the workflow.',
    });
  };

  // Template selection handler
  const handleTemplateSelect = (template: { name: string; workflow_type: string; default_stages: unknown[] }) => {
    setName(template.name);
    setWorkflowType(template.workflow_type);

    // Convert template stages to UI stages
    const templateStages = (template.default_stages as Array<{
      name: string;
      action_type: string;
      action_config: Record<string, unknown>;
      delay_value: number;
      delay_unit: string;
    }>).map((stage, index) => ({
      ui_id: `stage-${Date.now()}-${index}`,
      id: '',
      workflow_id: '',
      name: stage.name,
      stage_order: index,
      action_type: stage.action_type,
      action_config: stage.action_config || {},
      delay_value: stage.delay_value || 0,
      delay_unit: stage.delay_unit || 'days',
      conditions: null,
      exit_conditions: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    setStages(templateStages);
    setShowTemplateSelector(false);

    toast({
      title: 'Template applied',
      description: `Started with "${template.name}" template. Customize as needed.`,
    });
  };

  // Save workflow
  const handleSaveWorkflow = async () => {
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Workflow name is required',
        variant: 'destructive',
      });
      return;
    }

    if (stages.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'At least one stage is required',
        variant: 'destructive',
      });
      return;
    }

    // Prepare stages for saving (remove ui_id)
    const stagesToSave = stages.map(({ ui_id, ...stage }) => ({
      name: stage.name,
      stage_order: stage.stage_order,
      action_type: stage.action_type,
      action_config: stage.action_config,
      delay_value: stage.delay_value,
      delay_unit: stage.delay_unit,
      conditions: stage.conditions,
      exit_conditions: stage.exit_conditions,
    }));

    const workflowData = {
      name,
      description,
      workflow_type: workflowType,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      filter_conditions: filterConditions,
      goal_type: goalType,
      goal_config: goalConfig,
      stages: stagesToSave,
    };

    try {
      if (isEditMode && id) {
        await updateWorkflow.mutateAsync({ id, ...workflowData });
        toast({
          title: 'Success',
          description: 'Workflow updated successfully',
        });
      } else {
        const result = await createWorkflow.mutateAsync(workflowData);
        toast({
          title: 'Success',
          description: 'Workflow created successfully',
        });
        navigate(`/automation/workflows/${result.id}`);
      }
    } catch (error) {
      logger.error('Error saving workflow', { error });
      toast({
        title: 'Error',
        description: 'Failed to save workflow. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Activate/pause workflow
  const handleActivate = async () => {
    if (!id) return;

    try {
      await activateWorkflow.mutateAsync(id);
      setStatus('active');
      toast({
        title: 'Workflow activated',
        description: 'The workflow is now active and will start processing contacts.',
      });
    } catch (error) {
      logger.error('Error activating workflow', { error });
    }
  };

  const handlePause = async () => {
    if (!id) return;

    try {
      await pauseWorkflow.mutateAsync(id);
      setStatus('paused');
      toast({
        title: 'Workflow paused',
        description: 'The workflow has been paused. Existing executions will continue.',
      });
    } catch (error) {
      logger.error('Error pausing workflow', { error });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show template selector for new workflows
  if (showTemplateSelector && !isEditMode) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/automation/workflows')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Create Workflow</h1>
            <p className="text-muted-foreground">Choose a template or start from scratch</p>
          </div>
        </div>

        <WorkflowTemplateSelector
          onSelect={handleTemplateSelect}
          onStartBlank={() => setShowTemplateSelector(false)}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/automation/workflows')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">
                {isEditMode ? 'Edit Workflow' : 'Create Workflow'}
              </h1>
              {isEditMode && <WorkflowStatusBadge status={status} />}
            </div>
            <p className="text-muted-foreground">Build automated multi-stage workflows</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </>
            )}
          </Button>

          {isEditMode && status === 'draft' && (
            <Button variant="outline" onClick={handleActivate}>
              <Play className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}

          {isEditMode && status === 'active' && (
            <Button variant="outline" onClick={handlePause}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}

          <Button
            onClick={handleSaveWorkflow}
            disabled={createWorkflow.isPending || updateWorkflow.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {createWorkflow.isPending || updateWorkflow.isPending
              ? 'Saving...'
              : isEditMode
              ? 'Update'
              : 'Create'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${showPreview ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-6`}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="builder" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Builder
              </TabsTrigger>
              <TabsTrigger value="trigger" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Trigger
              </TabsTrigger>
              <TabsTrigger value="filters" className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </TabsTrigger>
              <TabsTrigger value="goals" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Goals
              </TabsTrigger>
            </TabsList>

            {/* Builder Tab */}
            <TabsContent value="builder" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Details</CardTitle>
                  <CardDescription>Basic information about your automation workflow</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Workflow Name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Renewal Reminder Sequence"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Workflow Type</Label>
                      <Select value={workflowType} onValueChange={setWorkflowType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom</SelectItem>
                          <SelectItem value="birthday">Birthday</SelectItem>
                          <SelectItem value="renewal">Renewal</SelectItem>
                          <SelectItem value="welcome">Welcome</SelectItem>
                          <SelectItem value="referral">Referral Request</SelectItem>
                          <SelectItem value="review">Review Request</SelectItem>
                          <SelectItem value="turning_65">Turning 65</SelectItem>
                          <SelectItem value="cross_sell">Cross-sell</SelectItem>
                          <SelectItem value="lost_deal">Lost Deal</SelectItem>
                          <SelectItem value="client_pulse">Client Pulse</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe the purpose and goals of this workflow..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Workflow Stages</CardTitle>
                      <CardDescription>
                        Define the sequence of actions. Drag to reorder.
                      </CardDescription>
                    </div>
                    <Button onClick={handleAddStage} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Stage
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {stages.length === 0 ? (
                    <EmptyStagesState onAddStage={handleAddStage} />
                  ) : (
                    <DragDropContext onDragEnd={handleDragEnd}>
                      <Droppable droppableId="stages">
                        {(provided) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="space-y-3"
                          >
                            {stages.map((stage, index) => (
                              <Draggable
                                key={stage.ui_id}
                                draggableId={stage.ui_id}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <StageCard
                                    stage={stage}
                                    index={index}
                                    isLast={index === stages.length - 1}
                                    isDragging={snapshot.isDragging}
                                    provided={provided}
                                    onEdit={() => handleEditStage(stage)}
                                    onDelete={() => handleDeleteStage(stage.ui_id)}
                                    onDuplicate={() => handleDuplicateStage(stage)}
                                  />
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Trigger Tab */}
            <TabsContent value="trigger">
              <WorkflowTriggerConfig
                triggerType={triggerType}
                triggerConfig={triggerConfig}
                onTriggerTypeChange={setTriggerType}
                onTriggerConfigChange={setTriggerConfig}
              />
            </TabsContent>

            {/* Filters Tab */}
            <TabsContent value="filters">
              <Card>
                <CardHeader>
                  <CardTitle>Enrollment Filters</CardTitle>
                  <CardDescription>
                    Define conditions that contacts must meet to be enrolled in this workflow
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WorkflowFilterBuilder
                    conditions={filterConditions}
                    onChange={setFilterConditions}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Goals Tab */}
            <TabsContent value="goals">
              <WorkflowGoalConfig
                goalType={goalType}
                goalConfig={goalConfig}
                onGoalTypeChange={setGoalType}
                onGoalConfigChange={setGoalConfig}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="lg:col-span-1">
            <WorkflowPreview
              name={name}
              description={description}
              workflowType={workflowType}
              triggerType={triggerType}
              stages={stages}
              goalType={goalType}
            />
          </div>
        )}
      </div>

      {/* Stage Modal */}
      <WorkflowStageModal
        open={isStageModalOpen}
        onOpenChange={setIsStageModalOpen}
        stage={editingStage}
        onSave={handleSaveStage}
      />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const statusConfig = {
    draft: { label: 'Draft', variant: 'secondary' as const },
    active: { label: 'Active', variant: 'default' as const },
    paused: { label: 'Paused', variant: 'outline' as const },
    archived: { label: 'Archived', variant: 'destructive' as const },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function EmptyStagesState({ onAddStage }: { onAddStage: () => void }) {
  return (
    <div className="text-center py-12 border-2 border-dashed rounded-lg">
      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <p className="text-muted-foreground mb-4">
        No stages yet. Add your first stage to define the workflow sequence.
      </p>
      <Button onClick={onAddStage} variant="outline">
        <Plus className="h-4 w-4 mr-2" />
        Add First Stage
      </Button>
    </div>
  );
}

interface StageCardProps {
  stage: WorkflowStageUI;
  index: number;
  isLast: boolean;
  isDragging: boolean;
  provided: any;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function StageCard({
  stage,
  index,
  isLast,
  isDragging,
  provided,
  onEdit,
  onDelete,
  onDuplicate,
}: StageCardProps) {
  return (
    <div>
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        className={`bg-card border rounded-lg p-4 transition-shadow ${
          isDragging ? 'shadow-lg ring-2 ring-primary' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            {...provided.dragHandleProps}
            className="mt-1 text-muted-foreground cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">Stage {index + 1}</Badge>
              <ActionTypeIcon actionType={stage.action_type} />
              <span className="font-medium">
                {stage.name || getActionTypeLabel(stage.action_type)}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {stage.delay_value > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Wait {stage.delay_value} {stage.delay_unit}
                </div>
              )}
              {stage.delay_value === 0 && index === 0 && (
                <span className="text-green-600">Immediate</span>
              )}
              {stage.conditions && (
                <Badge variant="secondary" className="text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  Conditional
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={onDuplicate} title="Duplicate">
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      {!isLast && (
        <div className="flex justify-center py-2">
          <div className="flex flex-col items-center">
            <div className="w-px h-4 bg-border" />
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="w-px h-4 bg-border" />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionTypeIcon({ actionType }: { actionType: string }) {
  const icons: Record<string, React.ReactNode> = {
    send_email: <Mail className="h-4 w-4 text-blue-500" />,
    send_sms: <MessageSquare className="h-4 w-4 text-green-500" />,
    create_task: <CheckSquare className="h-4 w-4 text-purple-500" />,
    webhook: <Webhook className="h-4 w-4 text-orange-500" />,
    wait: <Clock className="h-4 w-4 text-gray-500" />,
    update_field: <Edit className="h-4 w-4 text-yellow-500" />,
    add_tag: <Users className="h-4 w-4 text-pink-500" />,
    enroll_workflow: <RefreshCw className="h-4 w-4 text-cyan-500" />,
  };
  return icons[actionType] || <CheckSquare className="h-4 w-4" />;
}

function getActionTypeLabel(actionType: string): string {
  const labels: Record<string, string> = {
    send_email: 'Send Email',
    send_sms: 'Send SMS',
    create_task: 'Create Task',
    webhook: 'Call Webhook',
    wait: 'Wait/Delay',
    update_field: 'Update Field',
    add_tag: 'Add Tag',
    remove_tag: 'Remove Tag',
    enroll_workflow: 'Enroll in Workflow',
  };
  return labels[actionType] || actionType;
}

// ============================================================================
// Filter Builder (placeholder - would be expanded)
// ============================================================================

interface WorkflowFilterBuilderProps {
  conditions: Record<string, unknown>;
  onChange: (conditions: Record<string, unknown>) => void;
}

function WorkflowFilterBuilder({ conditions, onChange }: WorkflowFilterBuilderProps) {
  const [filterEnabled, setFilterEnabled] = useState(Object.keys(conditions).length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Enable Enrollment Filters</Label>
          <p className="text-sm text-muted-foreground">
            Only enroll contacts that match specific criteria
          </p>
        </div>
        <Switch
          checked={filterEnabled}
          onCheckedChange={(checked) => {
            setFilterEnabled(checked);
            if (!checked) {
              onChange({});
            }
          }}
        />
      </div>

      {filterEnabled && (
        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <Label>Contact Type</Label>
            <Select
              value={(conditions.contact_type as string) || 'all'}
              onValueChange={(value) =>
                onChange({ ...conditions, contact_type: value === 'all' ? undefined : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All contacts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contacts</SelectItem>
                <SelectItem value="lead">Leads Only</SelectItem>
                <SelectItem value="customer">Customers Only</SelectItem>
                <SelectItem value="former">Former Customers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Policy Type</Label>
            <Select
              value={(conditions.policy_type as string) || 'all'}
              onValueChange={(value) =>
                onChange({ ...conditions, policy_type: value === 'all' ? undefined : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any policy type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Policy Type</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="home">Home</SelectItem>
                <SelectItem value="life">Life</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Has Email</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={(conditions.require_email as boolean) || false}
                onCheckedChange={(checked) =>
                  onChange({ ...conditions, require_email: checked })
                }
              />
              <span className="text-sm text-muted-foreground">
                Only contacts with valid email addresses
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Has Phone</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={(conditions.require_phone as boolean) || false}
                onCheckedChange={(checked) =>
                  onChange({ ...conditions, require_phone: checked })
                }
              />
              <span className="text-sm text-muted-foreground">
                Only contacts with valid phone numbers
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
