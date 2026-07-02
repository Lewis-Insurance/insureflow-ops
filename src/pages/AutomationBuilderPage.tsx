import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  useMarketingAutomation,
  useCreateAutomation,
  useUpdateAutomation,
  useCreateAutomationStep,
  useUpdateAutomationStep,
  useDeleteAutomationStep,
  type TriggerType,
  type StepType,
  type AutomationStep,
} from '@/hooks/useMarketingAutomations';
import { useMarketingTemplates } from '@/hooks/useMarketingTemplates';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Mail,
  MessageSquare,
  Clock,
  GitBranch,
  Tag,
  Bell,
  CheckCircle,
  PlayCircle,
  Gift,
  RefreshCw,
  Users,
  Zap,
  Calendar,
  ChevronDown,
  ChevronUp,
  Settings2,
} from 'lucide-react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Step type configurations
const STEP_TYPES: Record<StepType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  send_email: { label: 'Send Email', icon: Mail, color: 'bg-info' },
  send_sms: { label: 'Send SMS', icon: MessageSquare, color: 'bg-success' },
  wait: { label: 'Wait/Delay', icon: Clock, color: 'bg-warning' },
  branch: { label: 'Branch/Condition', icon: GitBranch, color: 'bg-info' },
  add_tag: { label: 'Add Tag', icon: Tag, color: 'bg-warning' },
  remove_tag: { label: 'Remove Tag', icon: Tag, color: 'bg-destructive' },
  update_field: { label: 'Update Field', icon: Settings2, color: 'bg-cc-text-muted' },
  create_task: { label: 'Create Task', icon: CheckCircle, color: 'bg-info' },
  send_notification: { label: 'Send Notification', icon: Bell, color: 'bg-info' },
  enroll_in_automation: { label: 'Enroll in Automation', icon: PlayCircle, color: 'bg-info' },
  exit: { label: 'Exit Automation', icon: CheckCircle, color: 'bg-cc-text-secondary' },
};

const TRIGGER_TYPES: Record<TriggerType, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  birthday: { label: 'Birthday', icon: Gift, description: 'Trigger on contact birthday' },
  policy_renewal: { label: 'Policy Renewal', icon: RefreshCw, description: 'Trigger before policy renewal date' },
  new_customer: { label: 'New Customer', icon: Users, description: 'Trigger when a new customer is created' },
  claim_closed: { label: 'Claim Closed', icon: CheckCircle, description: 'Trigger when a claim is closed' },
  policy_anniversary: { label: 'Policy Anniversary', icon: Calendar, description: 'Trigger on policy anniversary' },
  no_contact: { label: 'No Contact', icon: Clock, description: 'Trigger after period of no contact' },
  tag_added: { label: 'Tag Added', icon: Tag, description: 'Trigger when a specific tag is added' },
  manual: { label: 'Manual', icon: PlayCircle, description: 'Manually enroll contacts' },
  api: { label: 'API Triggered', icon: Zap, description: 'Trigger via API call' },
};

interface StepFormData {
  step_name: string;
  step_type: StepType;
  delay_amount?: number;
  delay_unit?: 'minutes' | 'hours' | 'days' | 'weeks';
  step_config: Record<string, unknown>;
}

export default function AutomationBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isNew = id === 'new' || !id;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('manual');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [isActive, setIsActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Step management
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<AutomationStep | null>(null);
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);
  const [stepForm, setStepForm] = useState<StepFormData>({
    step_name: '',
    step_type: 'send_email',
    step_config: {},
  });

  // Queries
  const { data: automation, isLoading } = useMarketingAutomation(isNew ? null : id!);
  const { data: templates } = useMarketingTemplates();

  // Mutations
  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const createStep = useCreateAutomationStep();
  const updateStep = useUpdateAutomationStep();
  const deleteStep = useDeleteAutomationStep();

  // Load automation data
  useEffect(() => {
    if (automation) {
      setName(automation.name);
      setDescription(automation.description || '');
      setTriggerType(automation.trigger_type);
      setTriggerConfig(automation.trigger_config || {});
      setIsActive(automation.is_active);
      setSteps(automation.steps || []);
    }
  }, [automation]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Please enter a name for the automation', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      if (isNew) {
        const newAutomation = await createAutomation.mutateAsync({
          name,
          description: description || undefined,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          is_active: isActive,
        });
        navigate(`/marketing/automations/${newAutomation.id}`, { replace: true });
      } else {
        await updateAutomation.mutateAsync({
          id: id!,
          name,
          description: description || null,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          is_active: isActive,
        });
      }
    } catch (error) {
      // Error handled by mutation
    } finally {
      setIsSaving(false);
    }
  };

  const openStepModal = (step?: AutomationStep) => {
    if (step) {
      setEditingStep(step);
      setStepForm({
        step_name: step.step_name,
        step_type: step.step_type,
        delay_amount: step.delay_amount || undefined,
        delay_unit: (step.delay_unit as StepFormData['delay_unit']) || undefined,
        step_config: step.step_config || {},
      });
    } else {
      setEditingStep(null);
      setStepForm({
        step_name: '',
        step_type: 'send_email',
        step_config: {},
      });
    }
    setStepModalOpen(true);
  };

  const handleSaveStep = async () => {
    if (!stepForm.step_name.trim()) {
      toast({ title: 'Error', description: 'Please enter a step name', variant: 'destructive' });
      return;
    }

    if (isNew) {
      toast({ title: 'Save First', description: 'Please save the automation before adding steps', variant: 'destructive' });
      return;
    }

    try {
      if (editingStep) {
        await updateStep.mutateAsync({
          id: editingStep.id,
          recipe_id: id!,
          step_name: stepForm.step_name,
          step_type: stepForm.step_type,
          delay_amount: stepForm.delay_amount || null,
          delay_unit: stepForm.delay_unit || null,
          step_config: stepForm.step_config,
        });
      } else {
        await createStep.mutateAsync({
          recipe_id: id!,
          step_name: stepForm.step_name,
          step_order: steps.length + 1,
          step_type: stepForm.step_type,
          delay_amount: stepForm.delay_amount,
          delay_unit: stepForm.delay_unit,
          step_config: stepForm.step_config,
        });
      }
      setStepModalOpen(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDeleteStep = async () => {
    if (!deleteStepId) return;
    try {
      await deleteStep.mutateAsync({ id: deleteStepId, recipe_id: id! });
      setDeleteStepId(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const renderStepConfig = () => {
    switch (stepForm.step_type) {
      case 'send_email':
        return (
          <div className="space-y-4">
            <div>
              <Label>Email Template</Label>
              <Select
                value={(stepForm.step_config.template_id as string) || ''}
                onValueChange={(value) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, template_id: value } })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates?.filter((t) => t.channel === 'email').map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject Line Override (optional)</Label>
              <Input
                value={(stepForm.step_config.subject_override as string) || ''}
                onChange={(e) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, subject_override: e.target.value } })
                }
                placeholder="Leave blank to use template subject"
              />
            </div>
          </div>
        );

      case 'send_sms':
        return (
          <div className="space-y-4">
            <div>
              <Label>SMS Template</Label>
              <Select
                value={(stepForm.step_config.template_id as string) || ''}
                onValueChange={(value) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, template_id: value } })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates?.filter((t) => t.channel === 'sms').map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'wait':
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Wait Duration</Label>
              <Input
                type="number"
                min={1}
                value={stepForm.delay_amount || ''}
                onChange={(e) => setStepForm({ ...stepForm, delay_amount: parseInt(e.target.value) || undefined })}
                placeholder="Enter duration"
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Select
                value={stepForm.delay_unit || ''}
                onValueChange={(value) => setStepForm({ ...stepForm, delay_unit: value as StepFormData['delay_unit'] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'add_tag':
      case 'remove_tag':
        return (
          <div>
            <Label>Tag Name</Label>
            <Input
              value={(stepForm.step_config.tag_name as string) || ''}
              onChange={(e) =>
                setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, tag_name: e.target.value } })
              }
              placeholder="Enter tag name"
            />
          </div>
        );

      case 'create_task':
        return (
          <div className="space-y-4">
            <div>
              <Label>Task Title</Label>
              <Input
                value={(stepForm.step_config.task_title as string) || ''}
                onChange={(e) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, task_title: e.target.value } })
                }
                placeholder="Enter task title"
              />
            </div>
            <div>
              <Label>Task Description</Label>
              <Textarea
                value={(stepForm.step_config.task_description as string) || ''}
                onChange={(e) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, task_description: e.target.value } })
                }
                placeholder="Enter task description"
              />
            </div>
            <div>
              <Label>Due In (Days)</Label>
              <Input
                type="number"
                min={0}
                value={(stepForm.step_config.due_in_days as number) || ''}
                onChange={(e) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, due_in_days: parseInt(e.target.value) || 0 } })
                }
                placeholder="Days until due"
              />
            </div>
          </div>
        );

      case 'send_notification':
        return (
          <div className="space-y-4">
            <div>
              <Label>Notification Title</Label>
              <Input
                value={(stepForm.step_config.title as string) || ''}
                onChange={(e) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, title: e.target.value } })
                }
                placeholder="Enter notification title"
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                value={(stepForm.step_config.message as string) || ''}
                onChange={(e) =>
                  setStepForm({ ...stepForm, step_config: { ...stepForm.step_config, message: e.target.value } })
                }
                placeholder="Enter notification message"
              />
            </div>
          </div>
        );

      default:
        return (
          <p className="text-sm text-muted-foreground">
            Configuration options for this step type coming soon.
          </p>
        );
    }
  };

  if (isLoading && !isNew) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/marketing/automations')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {isNew ? 'Create Automation' : 'Edit Automation'}
              </h1>
              <p className="text-muted-foreground">
                {isNew ? 'Build a new automated workflow' : `Editing: ${automation?.name}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="is-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="is-active" className="text-sm">
                {isActive ? 'Active' : 'Inactive'}
              </Label>
            </div>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column - Settings */}
          <div className="space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Automation Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Birthday Greetings"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this automation do?"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Trigger Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Trigger</CardTitle>
                <CardDescription>When should this automation start?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Trigger Type</Label>
                  <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_TYPES).map(([key, config]) => {
                        const Icon = config.icon;
                        return (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {config.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {TRIGGER_TYPES[triggerType]?.description}
                  </p>
                </div>

                {/* Trigger-specific config */}
                {triggerType === 'policy_renewal' && (
                  <div>
                    <Label>Days Before Renewal</Label>
                    <Input
                      type="number"
                      min={1}
                      value={(triggerConfig.days_before as number) || 30}
                      onChange={(e) =>
                        setTriggerConfig({ ...triggerConfig, days_before: parseInt(e.target.value) || 30 })
                      }
                    />
                  </div>
                )}

                {triggerType === 'no_contact' && (
                  <div>
                    <Label>Days of No Contact</Label>
                    <Input
                      type="number"
                      min={1}
                      value={(triggerConfig.days_inactive as number) || 90}
                      onChange={(e) =>
                        setTriggerConfig({ ...triggerConfig, days_inactive: parseInt(e.target.value) || 90 })
                      }
                    />
                  </div>
                )}

                {triggerType === 'tag_added' && (
                  <div>
                    <Label>Tag Name</Label>
                    <Input
                      value={(triggerConfig.tag_name as string) || ''}
                      onChange={(e) => setTriggerConfig({ ...triggerConfig, tag_name: e.target.value })}
                      placeholder="Enter the tag that triggers this automation"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Steps Builder */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Workflow Steps</CardTitle>
                  <CardDescription>
                    {steps.length === 0
                      ? 'Add steps to build your automation workflow'
                      : `${steps.length} step${steps.length !== 1 ? 's' : ''} in this workflow`}
                  </CardDescription>
                </div>
                <Button onClick={() => openStepModal()} disabled={isNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Step
                </Button>
              </CardHeader>
              <CardContent>
                {isNew ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>Save the automation first to add workflow steps.</p>
                  </div>
                ) : steps.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No steps yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Add steps to define what happens when this automation runs
                    </p>
                    <Button onClick={() => openStepModal()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Step
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {steps.map((step, index) => {
                      const StepIcon = STEP_TYPES[step.step_type]?.icon || Zap;
                      const stepConfig = STEP_TYPES[step.step_type];
                      const isExpanded = expandedStep === step.id;

                      return (
                        <div key={step.id} className="relative">
                          {/* Connector line */}
                          {index > 0 && (
                            <div className="absolute left-6 -top-3 w-0.5 h-3 bg-border" />
                          )}
                          {index < steps.length - 1 && (
                            <div className="absolute left-6 -bottom-3 w-0.5 h-3 bg-border" />
                          )}

                          <div className="border rounded-lg overflow-hidden">
                            <div
                              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                            >
                              <div className="text-muted-foreground">
                                <GripVertical className="h-5 w-5" />
                              </div>
                              <div className={`p-2 rounded-lg ${stepConfig?.color || 'bg-cc-text-muted'}`}>
                                <StepIcon className="h-4 w-4 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{step.step_name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {stepConfig?.label}
                                  {step.delay_amount && ` • Wait ${step.delay_amount} ${step.delay_unit}`}
                                </div>
                              </div>
                              <Badge variant="outline">Step {index + 1}</Badge>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>

                            {isExpanded && (
                              <div className="border-t p-4 bg-muted/30">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openStepModal(step);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteStepId(step.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Step Modal */}
      <Dialog open={stepModalOpen} onOpenChange={setStepModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingStep ? 'Edit Step' : 'Add Step'}</DialogTitle>
            <DialogDescription>
              Configure the step action and settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Step Name *</Label>
              <Input
                value={stepForm.step_name}
                onChange={(e) => setStepForm({ ...stepForm, step_name: e.target.value })}
                placeholder="e.g., Send birthday email"
              />
            </div>

            <div>
              <Label>Action Type</Label>
              <Select
                value={stepForm.step_type}
                onValueChange={(v) => setStepForm({ ...stepForm, step_type: v as StepType, step_config: {} })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_TYPES).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded ${config.color}`}>
                            <Icon className="h-3 w-3 text-white" />
                          </div>
                          {config.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Step-specific configuration */}
            {renderStepConfig()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStepModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveStep}>
              {editingStep ? 'Update Step' : 'Add Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Step Confirmation */}
      <AlertDialog open={!!deleteStepId} onOpenChange={() => setDeleteStepId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Step</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this step? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStep} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
