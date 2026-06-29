import { useState } from 'react';
import { useLeadsByStage, useMoveLeadToStage, type Lead } from '@/hooks/useLeads';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Mail, Phone, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { humanizeEnum } from '@/lib/format';

const STAGES = [
  { id: 'new', label: 'New', color: 'bg-blue-500' },
  { id: 'contacted', label: 'Contacted', color: 'bg-purple-500' },
  { id: 'qualified', label: 'Qualified', color: 'bg-yellow-500' },
  { id: 'quoted', label: 'Quoted', color: 'bg-orange-500' },
  { id: 'won', label: 'Won', color: 'bg-green-500' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500' },
  { id: 'nurturing', label: 'Nurturing', color: 'bg-gray-500' },
];

interface LeadCardProps {
  lead: Lead;
  isDragging?: boolean;
  onClick?: () => void;
}

function DraggableLeadCard({ lead, onClick }: Omit<LeadCardProps, 'isDragging'>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card
        className={cn(
          'cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md',
          isDragging && 'opacity-50'
        )}
        onClick={onClick}
      >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">
              {lead.first_name} {lead.last_name}
            </h4>
            <p className="text-xs text-muted-foreground truncate">
              {lead.source_name || 'Unknown Source'}
            </p>
          </div>
          <Badge variant="secondary" className="ml-2 shrink-0">
            {lead.lead_score}
          </Badge>
        </div>

        <div className="space-y-1.5 text-xs">
          {lead.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.phone}</span>
            </div>
          )}
          {lead.current_premium && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-3 w-3 shrink-0" />
              <span>${lead.current_premium.toLocaleString()}/year</span>
            </div>
          )}
        </div>

        {lead.insurance_types && lead.insurance_types.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lead.insurance_types.slice(0, 3).map((type) => (
              <Badge key={type} variant="outline" className="text-xs">
                {humanizeEnum(type)}
              </Badge>
            ))}
            {lead.insurance_types.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{lead.insurance_types.length - 3}
              </Badge>
            )}
          </div>
        )}

        {lead.assigned_to_name && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-xs">
                {lead.assigned_to_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">
              {lead.assigned_to_name}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

function LeadCard({ lead, isDragging, onClick }: LeadCardProps) {
  return (
    <Card
      className={cn(
        'cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md',
        isDragging && 'opacity-50'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">
              {lead.first_name} {lead.last_name}
            </h4>
            <p className="text-xs text-muted-foreground truncate">
              {lead.source_name || 'Unknown Source'}
            </p>
          </div>
          <Badge variant="secondary" className="ml-2 shrink-0">
            {lead.lead_score}
          </Badge>
        </div>

        <div className="space-y-1.5 text-xs">
          {lead.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{lead.phone}</span>
            </div>
          )}
          {lead.current_premium && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-3 w-3 shrink-0" />
              <span>${lead.current_premium.toLocaleString()}/year</span>
            </div>
          )}
        </div>

        {lead.insurance_types && lead.insurance_types.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lead.insurance_types.slice(0, 3).map((type) => (
              <Badge key={type} variant="outline" className="text-xs">
                {humanizeEnum(type)}
              </Badge>
            ))}
            {lead.insurance_types.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{lead.insurance_types.length - 3}
              </Badge>
            )}
          </div>
        )}

        {lead.assigned_to_name && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-xs">
                {lead.assigned_to_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">
              {lead.assigned_to_name}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StageColumnProps {
  stage: typeof STAGES[number];
  leads: Lead[];
  count: number;
  onLeadClick: (leadId: string) => void;
}

function StageColumn({ stage, leads, count, onLeadClick }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div className="flex-shrink-0 w-80">
      <div 
        ref={setNodeRef}
        className={cn(
          'bg-muted/50 rounded-lg p-4 h-[calc(100vh-16rem)] flex flex-col transition-colors',
          isOver && 'bg-muted ring-2 ring-primary'
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn('w-3 h-3 rounded-full', stage.color)} />
            <h3 className="font-semibold">{stage.label}</h3>
          </div>
          <Badge variant="secondary">{count}</Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-3 pr-4">
            {leads.map((lead) => (
              <DraggableLeadCard 
                key={lead.id} 
                lead={lead} 
                onClick={() => onLeadClick(lead.id)} 
              />
            ))}
            {leads.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                No leads in this stage
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface PipelineKanbanProps {
  onLeadClick?: (leadId: string) => void;
}

export function PipelineKanban({ onLeadClick }: PipelineKanbanProps) {
  const { data: leadsByStage, isLoading, error } = useLeadsByStage();
  const moveLeadToStage = useMoveLeadToStage();
  const [activeId, setActiveId] = useState<string | null>(null);

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

    if (over && active.id !== over.id) {
      const leadId = active.id as string;
      const newStatus = over.id as string;

      // Only move if dropping on a valid stage
      if (STAGES.some((stage) => stage.id === newStatus)) {
        moveLeadToStage.mutate({ leadId, newStatus });
      }
    }

    setActiveId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-destructive font-semibold">Error loading pipeline</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
        </div>
      </div>
    );
  }

  const activeLead = activeId
    ? Object.values(leadsByStage || {})
        .flat()
        .find((lead) => lead.id === activeId)
    : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            leads={leadsByStage?.[stage.id as keyof typeof leadsByStage] || []}
            count={leadsByStage?.[stage.id as keyof typeof leadsByStage]?.length || 0}
            onLeadClick={onLeadClick || (() => {})}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
