import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLeads, useMoveLeadToStage, type Lead } from "@/hooks/useLeads";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Mail, Calendar, DollarSign, TrendingUp, Users, Target } from "lucide-react";
import { format } from "date-fns";
import { useLeadMetrics } from "@/hooks/useLeadAnalytics";
import { LeadDetailView } from "./LeadDetailView";

const STAGES = [
  { id: 'new', label: 'New Leads', color: 'bg-blue-500' },
  { id: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { id: 'qualified', label: 'Qualified', color: 'bg-purple-500' },
  { id: 'quoted', label: 'Quoted', color: 'bg-orange-500' },
  { id: 'nurturing', label: 'Nurturing', color: 'bg-gray-500' },
  { id: 'won', label: 'Won', color: 'bg-green-500' },
];

const LeadCard = ({ 
  lead, 
  onDragStart, 
  onClick 
}: { 
  lead: Lead & any; 
  onDragStart: (lead: Lead) => void;
  onClick: (lead: Lead) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - dragStartPos.x, 2) + Math.pow(e.clientY - dragStartPos.y, 2)
      );
      if (distance > 5) {
        setIsDragging(true);
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      onClick(lead);
    }
    setDragStartPos(null);
    setIsDragging(false);
  };

  return (
    <Card
      draggable
      onDragStart={() => onDragStart(lead)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      className="cursor-pointer hover:shadow-md transition-shadow"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-semibold text-sm">
              {lead.first_name} {lead.last_name}
            </h4>
            {lead.source && (
              <Badge variant="outline" className="mt-1">
                {lead.source.name}
              </Badge>
            )}
          </div>
          <Badge
            variant="secondary"
            className={`${
              lead.lead_score >= 80
                ? 'bg-green-100 text-green-800'
                : lead.lead_score >= 60
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {lead.lead_score}
          </Badge>
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          {lead.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-3 w-3" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3" />
              <span>{lead.phone}</span>
            </div>
          )}
          {lead.current_premium && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-3 w-3" />
              <span>${lead.current_premium.toLocaleString()}/yr</span>
            </div>
          )}
          {lead.created_at && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(lead.created_at), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        {lead.assigned && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Avatar className="h-6 w-6">
              <AvatarImage src={lead.assigned.avatar_url} />
              <AvatarFallback className="text-xs">
                {lead.assigned.full_name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">
              {lead.assigned.full_name}
            </span>
          </div>
        )}

        {lead.insurance_types && lead.insurance_types.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lead.insurance_types.slice(0, 3).map((need: string) => (
              <Badge key={need} variant="secondary" className="text-xs">
                {need}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const KanbanColumn = ({
  stage,
  leads,
  onDrop,
  onDragStart,
  onLeadClick,
}: {
  stage: typeof STAGES[0];
  leads: (Lead & any)[];
  onDrop: (status: Lead['status']) => void;
  onDragStart: (lead: Lead) => void;
  onLeadClick: (lead: Lead) => void;
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(stage.id as Lead['status']);
  };

  return (
    <div
      className="flex-1 min-w-[300px]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Card className={isDragOver ? 'ring-2 ring-primary' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${stage.color}`}></div>
              {stage.label}
            </CardTitle>
            <Badge variant="secondary">{leads.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto">
          {leads.map((lead) => (
            <LeadCard 
              key={lead.id} 
              lead={lead} 
              onDragStart={onDragStart} 
              onClick={onLeadClick}
            />
          ))}
          {leads.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No leads in this stage
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const PipelineKanban = ({ filters }: { filters?: any }) => {
  const { data: leadsResponse, isLoading } = useLeads(filters);
  const leads = leadsResponse?.data || [];
  const { data: metrics } = useLeadMetrics();
  const moveLeadStage = useMoveLeadToStage();
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead);
  };

  const handleDrop = (status: Lead['status']) => {
    if (!draggedLead) return;

    moveLeadStage.mutate({
      leadId: draggedLead.id,
      newStatus: status,
    });

    setDraggedLead(null);
  };

  const handleLeadClick = (lead: Lead) => {
    setSelectedLeadId(lead.id);
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div key={stage.id} className="flex-1 min-w-[300px]">
            <Card>
              <CardHeader>
                <div className="h-4 bg-muted rounded w-24 animate-pulse"></div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-32 bg-muted rounded animate-pulse"></div>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  const leadsByStage = STAGES.map((stage) => ({
    ...stage,
    leads: leads?.filter((lead) => lead.status === stage.id) || [],
  }));

  return (
    <div className="space-y-4">
      {/* Pipeline Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Pipeline</p>
                <h3 className="text-2xl font-bold">{leads?.length || 0}</h3>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pipeline Value</p>
                <h3 className="text-2xl font-bold">
                  ${((metrics?.total_pipeline_value || 0) / 1000).toFixed(0)}K
                </h3>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Lead Score</p>
                <h3 className="text-2xl font-bold">
                  {metrics?.average_score?.toFixed(0) || 0}
                </h3>
              </div>
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
                <h3 className="text-2xl font-bold">
                  {metrics?.conversion_rate?.toFixed(1) || 0}%
                </h3>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sales Pipeline</h2>
        <p className="text-sm text-muted-foreground">
          Drag and drop leads between stages
        </p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {leadsByStage.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            leads={stage.leads}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onLeadClick={handleLeadClick}
          />
        ))}
      </div>

      {/* Lead Detail View */}
      <LeadDetailView
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => !open && setSelectedLeadId(null)}
      />
    </div>
  );
};
