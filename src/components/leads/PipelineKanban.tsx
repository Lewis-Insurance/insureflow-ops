// src/components/leads/PipelineKanban.tsx
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useLeadsByStage, useMoveLeadToStage } from '@/hooks/useLeads';
import { LeadCard } from './LeadCard';
import { LeadDetailPanel } from './LeadDetailPanel';
import { Lead, LeadStatus } from '@/types/leads';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertCircle, 
  MessageSquare, 
  CheckCircle2, 
  FileText, 
  Clock, 
  Trophy, 
  XCircle,
  Sparkles 
} from 'lucide-react';

const STAGE_CONFIG: Record<LeadStatus, { 
  title: string; 
  color: string; 
  icon: any;
  description: string;
}> = {
  new: {
    title: 'New Leads',
    color: 'bg-blue-500',
    icon: Sparkles,
    description: 'Fresh leads awaiting contact',
  },
  contacted: {
    title: 'Contacted',
    color: 'bg-purple-500',
    icon: MessageSquare,
    description: 'Initial contact made',
  },
  qualified: {
    title: 'Qualified',
    color: 'bg-indigo-500',
    icon: CheckCircle2,
    description: 'Qualified and ready for quote',
  },
  quoted: {
    title: 'Quoted',
    color: 'bg-amber-500',
    icon: FileText,
    description: 'Quote provided',
  },
  won: {
    title: 'Won',
    color: 'bg-green-500',
    icon: Trophy,
    description: 'Successfully converted',
  },
  lost: {
    title: 'Lost',
    color: 'bg-red-500',
    icon: XCircle,
    description: 'Opportunity lost',
  },
  nurturing: {
    title: 'Nurturing',
    color: 'bg-teal-500',
    icon: AlertCircle,
    description: 'Long-term follow-up',
  },
};

export function PipelineKanban({ onLeadClick }: { onLeadClick?: (leadId: string) => void }) {
  const { data: leadsByStage, isLoading } = useLeadsByStage();
  const moveLeadToStage = useMoveLeadToStage();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // Dropped outside the list
    if (!destination) return;

    // Dropped in the same position
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const newStatus = destination.droppableId as LeadStatus;
    
    moveLeadToStage.mutate({
      leadId: draggableId,
      newStatus,
    });
  };

  const handleLeadClick = (lead: Lead) => {
    onLeadClick?.(lead.id);
    setSelectedLead(lead);
    setDetailPanelOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <Skeleton key={j} className="h-24 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const activeStages: LeadStatus[] = ['new', 'contacted', 'qualified', 'quoted'];
  const outcomeStages: LeadStatus[] = ['won', 'lost', 'nurturing'];

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-6">
          {/* Active Pipeline */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Active Pipeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {activeStages.map((stage) => {
                const config = STAGE_CONFIG[stage];
                const leads = leadsByStage?.[stage] || [];
                const totalValue = leads.reduce((sum, lead) => sum + (lead.estimated_premium || 0), 0);
                const Icon = config.icon;

                return (
                  <Droppable key={stage} droppableId={stage}>
                    {(provided, snapshot) => (
                      <Card
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={snapshot.isDraggingOver ? 'ring-2 ring-primary' : ''}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded ${config.color} text-white`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <CardTitle className="text-sm font-semibold">
                                {config.title}
                              </CardTitle>
                            </div>
                            <Badge variant="secondary" className="ml-2">
                              {leads.length}
                            </Badge>
                          </div>
                          {totalValue > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              ${totalValue.toLocaleString()} pipeline
                            </p>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <ScrollArea className="h-[calc(100vh-280px)]">
                            <div className="space-y-2 pr-4">
                              {leads.map((lead, index) => (
                                <Draggable
                                  key={lead.id}
                                  draggableId={lead.id}
                                  index={index}
                                >
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      onClick={() => handleLeadClick(lead as any)}
                                    >
                                      <LeadCard
                                        lead={lead as any}
                                        isDragging={snapshot.isDragging}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                              {leads.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                  No leads in this stage
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </div>

          {/* Outcome Stages */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Outcomes</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {outcomeStages.map((stage) => {
                const config = STAGE_CONFIG[stage];
                const leads = leadsByStage?.[stage] || [];
                const Icon = config.icon;

                return (
                  <Droppable key={stage} droppableId={stage}>
                    {(provided, snapshot) => (
                      <Card
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={snapshot.isDraggingOver ? 'ring-2 ring-primary' : ''}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded ${config.color} text-white`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <CardTitle className="text-sm font-semibold">
                                {config.title}
                              </CardTitle>
                            </div>
                            <Badge variant="secondary">{leads.length}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <ScrollArea className="h-[300px]">
                            <div className="space-y-2 pr-4">
                              {leads.slice(0, 10).map((lead, index) => (
                                <Draggable
                                  key={lead.id}
                                  draggableId={lead.id}
                                  index={index}
                                >
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      onClick={() => handleLeadClick(lead as any)}
                                    >
                                      <LeadCard
                                        lead={lead as any}
                                        isDragging={snapshot.isDragging}
                                        compact
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                              {leads.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                  No leads
                                </div>
                              )}
                              {leads.length > 10 && (
                                <p className="text-xs text-muted-foreground text-center py-2">
                                  +{leads.length - 10} more
                                </p>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </div>
        </div>
      </DragDropContext>

      {/* Lead Detail Panel */}
      <LeadDetailPanel
        lead={selectedLead}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
      />
    </>
  );
}
