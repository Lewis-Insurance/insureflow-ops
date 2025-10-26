import { useState } from 'react';
import { useLeads, useMoveLeadToStage, type Lead } from '@/hooks/useLeads';
import { usePipelineStages } from '@/integrations/supabase/hooks/usePipelineStages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, Mail, Clock, DollarSign, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PipelineKanbanProps {
  onLeadClick?: (leadId: string) => void;
}

type LeadCardData = Lead & {
  source?: { name: string } | null;
  assigned?: { full_name: string } | null;
};

interface LeadCardProps {
  lead: LeadCardData;
  onClick?: () => void;
}

function LeadCard({ lead, onClick }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getLeadScoreColor = (score: number | null) => {
    if (!score) return 'bg-gray-500';
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-gray-400';
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-3"
    >
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={onClick}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {getInitials(lead.first_name, lead.last_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h4 className="font-semibold text-sm">
                  {lead.first_name} {lead.last_name}
                </h4>
                {(lead.assigned?.full_name) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {lead.assigned.full_name}
                  </p>
                )}
              </div>
            </div>
            {lead.lead_score !== null && (
              <Badge className={`${getLeadScoreColor(lead.lead_score)} text-white text-xs`}>
                {lead.lead_score}
              </Badge>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-1 mb-3">
            {lead.email && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span>{lead.phone}</span>
              </div>
            )}
          </div>

          {/* Insurance Needs */}
          {lead.insurance_types && lead.insurance_types.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {lead.insurance_types.slice(0, 3).map((need) => (
                <Badge key={need} variant="secondary" className="text-xs">
                  {need}
                </Badge>
              ))}
              {lead.insurance_types.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{lead.insurance_types.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
            </div>
            {lead.current_premium && (
              <div className="flex items-center gap-1 font-medium">
                <DollarSign className="h-3 w-3" />
                <span>{lead.current_premium.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Source */}
          {lead.source && (
            <div className="mt-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                Source: {lead.source.name}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface StageColumnProps {
  stage: any;
  leads: Lead[];
  onLeadClick?: (leadId: string) => void;
}

function StageColumn({ stage, leads, onLeadClick }: StageColumnProps) {
  const leadsInStage = leads.filter((lead) => lead.status === stage.slug);
  const totalValue = leadsInStage.reduce(
    (sum, lead) => sum + (lead.current_premium || 0),
    0
  );

  return (
    <div className="flex-shrink-0 w-80">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <CardTitle className="text-base">{stage.name}</CardTitle>
            </div>
            <Badge variant="secondary">{leadsInStage.length}</Badge>
          </div>
          {stage.description && (
            <p className="text-xs text-muted-foreground mt-1">
              {stage.description}
            </p>
          )}
          {totalValue > 0 && (
            <p className="text-xs font-medium mt-1">
              Total Value: ${totalValue.toLocaleString()}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-3">
          <SortableContext
            items={leadsInStage.map((lead) => lead.id)}
            strategy={verticalListSortingStrategy}
          >
            <ScrollArea className="h-full pr-3">
              {leadsInStage.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No leads in this stage
                </div>
              ) : (
                leadsInStage.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={() => onLeadClick?.(lead.id)}
                  />
                ))
              )}
            </ScrollArea>
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

export function PipelineKanban({ onLeadClick }: PipelineKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const { data: stages = [] } = usePipelineStages();
  const { data: leads = [] } = useLeads();
  const moveLeadToStageMutation = useMoveLeadToStage();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const activeLeadId = active.id as string;
    const overStageId = over.id as string;

    // Find if we dropped over a stage column (not another lead)
    const targetStage = stages.find((stage) => stage.id === overStageId);
    
    if (targetStage) {
      const activeLead = leads.find((lead) => lead.id === activeLeadId);
      
      if (activeLead && activeLead.status !== targetStage.slug) {
        moveLeadToStageMutation.mutate({
          leadId: activeLeadId,
          newStatus: targetStage.slug,
        });
      }
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const activeLead = activeId ? leads.find((lead) => lead.id === activeId) : null;

  // Separate active stages from terminal stages
  const activeStages = stages.filter((stage) => stage.stage_type === 'active');
  const terminalStages = stages.filter((stage) => ['won', 'lost'].includes(stage.stage_type));

  return (
    <div className="space-y-6">
      {/* Active Pipeline */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Active Pipeline</h2>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {activeStages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                leads={leads as any}
                onLeadClick={onLeadClick}
              />
            ))}
          </div>

          <DragOverlay>
            {activeLead ? (
              <div className="w-80">
                <LeadCard lead={activeLead as any} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Terminal Stages */}
      {terminalStages.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Closed</h2>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {terminalStages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                leads={leads as any}
                onLeadClick={onLeadClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
