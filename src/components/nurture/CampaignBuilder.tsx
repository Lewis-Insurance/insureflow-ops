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
import { 
  useNurtureCampaign, 
  useCreateNurtureCampaign, 
  useUpdateNurtureCampaign 
} from '@/integrations/supabase/hooks/useNurtureCampaigns';
import { useToast } from '@/hooks/use-toast';
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
  EyeOff
} from 'lucide-react';
import { TriggerConditionsBuilder } from './TriggerConditionsBuilder';
import { CampaignStepModal } from './CampaignStepModal';
import { CampaignPreview } from './CampaignPreview';

interface CampaignStep {
  id: string;
  step_number: number;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days' | 'weeks';
  channel: 'email' | 'sms' | 'task' | 'webhook';
  template_id: string | null;
  conditions?: any;
  action_data?: any;
}

export function CampaignBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditMode = !!id;

  const { data: existingCampaign, isLoading } = useNurtureCampaign(id);
  const createCampaign = useCreateNurtureCampaign();
  const updateCampaign = useUpdateNurtureCampaign();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerConditions, setTriggerConditions] = useState<any>({});
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [active, setActive] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [editingStep, setEditingStep] = useState<CampaignStep | null>(null);
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);

  useEffect(() => {
    if (existingCampaign) {
      setName(existingCampaign.name);
      setDescription(existingCampaign.description || '');
      setTriggerConditions(existingCampaign.trigger_conditions);
      setActive(existingCampaign.active);
      
      const campaignSteps = existingCampaign.steps.map((step: any, index: number) => ({
        ...step,
        id: `step-${index}`,
      }));
      setSteps(campaignSteps);
    }
  }, [existingCampaign]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(steps);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedSteps = items.map((step, index) => ({
      ...step,
      step_number: index + 1,
    }));

    setSteps(updatedSteps);
  };

  const handleAddStep = () => {
    const newStep: CampaignStep = {
      id: `step-${Date.now()}`,
      step_number: steps.length + 1,
      delay_value: 1,
      delay_unit: 'days',
      channel: 'email',
      template_id: null,
      action_data: {},
    };
    setEditingStep(newStep);
    setIsStepModalOpen(true);
  };

  const handleEditStep = (step: CampaignStep) => {
    setEditingStep(step);
    setIsStepModalOpen(true);
  };

  const handleDeleteStep = (stepId: string) => {
    const updatedSteps = steps
      .filter(s => s.id !== stepId)
      .map((step, index) => ({
        ...step,
        step_number: index + 1,
      }));
    setSteps(updatedSteps);
  };

  const handleSaveStep = (step: CampaignStep) => {
    if (steps.find(s => s.id === step.id)) {
      setSteps(steps.map(s => s.id === step.id ? step : s));
    } else {
      setSteps([...steps, step]);
    }
    setIsStepModalOpen(false);
    setEditingStep(null);
  };

  const handleSaveCampaign = async () => {
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Campaign name is required',
        variant: 'destructive',
      });
      return;
    }

    if (steps.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'At least one step is required',
        variant: 'destructive',
      });
      return;
    }

    const stepsToSave = steps.map(({ id, ...step }) => step);

    const campaignData = {
      name,
      description,
      trigger_conditions: triggerConditions,
      steps: stepsToSave,
      active,
    };

    try {
      if (isEditMode && id) {
        await updateCampaign.mutateAsync({ id, updates: campaignData });
        toast({
          title: 'Success',
          description: 'Campaign updated successfully',
        });
      } else {
        const result = await createCampaign.mutateAsync(campaignData as any);
        toast({
          title: 'Success',
          description: 'Campaign created successfully',
        });
        navigate(`/campaigns/${result.id}`);
      }
    } catch (error) {
      console.error('Error saving campaign:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading campaign...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/campaigns')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {isEditMode ? 'Edit Campaign' : 'Create Campaign'}
            </h1>
            <p className="text-muted-foreground">
              Build automated nurture sequences to engage leads
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Show Preview
              </>
            )}
          </Button>
          <Button
            onClick={handleSaveCampaign}
            disabled={createCampaign.isPending || updateCampaign.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {isEditMode ? 'Update Campaign' : 'Create Campaign'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>
                Basic information about your nurture campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., New Lead Welcome Series"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose of this campaign..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Campaign Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Active campaigns will automatically enroll matching leads
                  </p>
                </div>
                <Switch
                  checked={active}
                  onCheckedChange={setActive}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Enrollment Triggers</CardTitle>
              <CardDescription>
                Define when leads should be enrolled in this campaign
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TriggerConditionsBuilder
                conditions={triggerConditions}
                onChange={setTriggerConditions}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Campaign Steps</CardTitle>
                  <CardDescription>
                    Drag to reorder, click to edit
                  </CardDescription>
                </div>
                <Button onClick={handleAddStep} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {steps.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No steps yet. Add your first step to get started.
                  </p>
                  <Button onClick={handleAddStep} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Step
                  </Button>
                </div>
              ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="steps">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-3"
                      >
                        {steps.map((step, index) => (
                          <Draggable
                            key={step.id}
                            draggableId={step.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`bg-card border rounded-lg p-4 transition-shadow ${
                                  snapshot.isDragging ? 'shadow-lg' : ''
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
                                      <Badge variant="outline">
                                        Step {step.step_number}
                                      </Badge>
                                      <ChannelIcon channel={step.channel} />
                                      <span className="font-medium">
                                        {getChannelLabel(step.channel)}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-4 w-4" />
                                        Wait {step.delay_value} {step.delay_unit}
                                      </div>
                                      {step.template_id && (
                                        <Badge variant="secondary">
                                          Template Selected
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleEditStep(step)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleDeleteStep(step.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
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
        </div>

        {showPreview && (
          <div className="lg:col-span-1">
            <CampaignPreview
              name={name}
              description={description}
              triggerConditions={triggerConditions}
              steps={steps}
            />
          </div>
        )}
      </div>

      <CampaignStepModal
        open={isStepModalOpen}
        onOpenChange={setIsStepModalOpen}
        step={editingStep}
        onSave={handleSaveStep}
      />
    </div>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  const icons = {
    email: <Mail className="h-4 w-4" />,
    sms: <MessageSquare className="h-4 w-4" />,
    task: <CheckSquare className="h-4 w-4" />,
    webhook: <Webhook className="h-4 w-4" />,
  };
  return icons[channel as keyof typeof icons] || null;
}

function getChannelLabel(channel: string): string {
  const labels = {
    email: 'Email',
    sms: 'SMS Message',
    task: 'Create Task',
    webhook: 'Webhook',
  };
  return labels[channel as keyof typeof labels] || channel;
}
