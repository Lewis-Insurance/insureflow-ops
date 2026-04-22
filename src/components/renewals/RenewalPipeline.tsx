import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, differenceInDays, startOfToday } from 'date-fns';
import { parseLocalDate } from '@/lib/date/localDate';
import {
  GripVertical,
  Building2,
  DollarSign,
  Clock,
  AlertTriangle,
  Users,
  CheckCircle,
  XCircle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import {
  useRenewals,
  useUpdateRenewalStatus,
  Renewal,
  RenewalStatus,
  getStatusConfig,
} from '@/hooks/useRenewalWorkflow';

// Pipeline column configuration
const PIPELINE_COLUMNS: {
  status: RenewalStatus;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    status: 'pending',
    label: 'Pending',
    description: 'Not yet contacted',
    icon: Clock,
    color: 'border-t-gray-500',
  },
  {
    status: 'contacted',
    label: 'Contacted',
    description: 'Initial contact made',
    icon: Users,
    color: 'border-t-blue-500',
  },
  {
    status: 'quoted',
    label: 'Quoted',
    description: 'Quotes sent',
    icon: DollarSign,
    color: 'border-t-yellow-500',
  },
  {
    status: 'renewed',
    label: 'Renewed',
    description: 'Successfully renewed',
    icon: CheckCircle,
    color: 'border-t-green-500',
  },
  {
    status: 'lost',
    label: 'Lost',
    description: 'Customer left',
    icon: XCircle,
    color: 'border-t-red-500',
  },
];

interface RenewalPipelineProps {
  className?: string;
}

export function RenewalPipeline({ className }: RenewalPipelineProps) {
  const navigate = useNavigate();
  const { data: renewals = [], isLoading } = useRenewals();
  const updateStatus = useUpdateRenewalStatus();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Group renewals by status
  const renewalsByStatus = useMemo(() => {
    const grouped: Record<RenewalStatus, Renewal[]> = {
      pending: [],
      contacted: [],
      quoted: [],
      renewed: [],
      lost: [],
      cancelled: [],
      moved: [],
      non_renewed: [],
      // Legacy statuses - map to appropriate columns
      upcoming: [],
      in_progress: [],
      completed: [],
    };

    renewals.forEach((renewal) => {
      // Map legacy statuses
      let status = renewal.status;
      if (status === 'upcoming') status = 'pending';
      if (status === 'in_progress') status = 'contacted';
      if (status === 'completed') status = 'renewed';

      if (grouped[status]) {
        grouped[status].push(renewal);
      }
    });

    // Sort each column by renewal date
    Object.keys(grouped).forEach((status) => {
      grouped[status as RenewalStatus].sort(
        (a, b) =>
          new Date(a.renewal_date || 0).getTime() - new Date(b.renewal_date || 0).getTime()
      );
    });

    return grouped;
  }, [renewals]);

  // Calculate column stats
  const columnStats = useMemo(() => {
    const stats: Record<string, { count: number; premium: number }> = {};
    PIPELINE_COLUMNS.forEach((col) => {
      const items = renewalsByStatus[col.status] || [];
      stats[col.status] = {
        count: items.length,
        premium: items.reduce((sum, r) => sum + (r.current_premium || 0), 0),
      };
    });
    return stats;
  }, [renewalsByStatus]);

  // Find the active renewal being dragged
  const activeRenewal = useMemo(
    () => renewals.find((r) => r.id === activeId),
    [renewals, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    // Get the target column (status)
    const targetStatus = over.id as RenewalStatus;
    const renewalId = active.id as string;

    // Find the renewal
    const renewal = renewals.find((r) => r.id === renewalId);
    if (!renewal) return;

    // Only update if status actually changed
    if (renewal.status !== targetStatus) {
      // Check if this status requires additional info
      if (targetStatus === 'moved' || targetStatus === 'lost') {
        // For moved/lost, navigate to detail page to capture reason
        navigate(`/renewals/${renewalId}/edit?status=${targetStatus}`);
      } else {
        // Direct status update
        updateStatus.mutate({ renewalId, status: targetStatus });
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map((col) => (
          <div key={col.status} className="w-[300px] flex-shrink-0">
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={`flex gap-4 overflow-x-auto pb-4 ${className || ''}`}>
        {PIPELINE_COLUMNS.map((column) => {
          const items = renewalsByStatus[column.status] || [];
          const stats = columnStats[column.status];
          const Icon = column.icon;
          const isOver = overId === column.status;

          return (
            <div
              key={column.status}
              className="w-[300px] flex-shrink-0"
              id={column.status}
            >
              <Card
                className={`h-full transition-colors ${column.color} border-t-4 ${
                  isOver ? 'ring-2 ring-primary ring-offset-2' : ''
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium">{column.label}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {stats.count}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{column.description}</p>
                  {stats.premium > 0 && (
                    <p className="text-xs font-medium text-muted-foreground">
                      {formatCurrency(stats.premium)} total
                    </p>
                  )}
                </CardHeader>

                <CardContent className="p-2">
                  <SortableContext
                    items={items.map((r) => r.id)}
                    strategy={verticalListSortingStrategy}
                    id={column.status}
                  >
                    <ScrollArea className="h-[calc(100vh-350px)] min-h-[300px]">
                      <div
                        className="space-y-2 p-1"
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOverId(column.status);
                        }}
                        onDragLeave={() => setOverId(null)}
                      >
                        {items.length === 0 ? (
                          <div
                            className={`flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg ${
                              isOver ? 'border-primary bg-primary/5' : ''
                            }`}
                          >
                            <ArrowRight className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-xs">Drop here</p>
                          </div>
                        ) : (
                          items.map((renewal) => (
                            <PipelineCard
                              key={renewal.id}
                              renewal={renewal}
                              onClick={() => navigate(`/renewals/${renewal.id}/edit`)}
                            />
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </SortableContext>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeRenewal && (
          <PipelineCard renewal={activeRenewal} isDragging onClick={() => {}} />
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Pipeline Card Component
function PipelineCard({
  renewal,
  isDragging,
  onClick,
}: {
  renewal: Renewal;
  isDragging?: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: renewal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const daysRemaining = renewal.renewal_date
    ? differenceInDays(parseLocalDate(renewal.renewal_date), startOfToday())
    : null;

  const getDaysColor = () => {
    if (daysRemaining === null) return 'text-muted-foreground';
    if (daysRemaining < 0) return 'text-red-600';
    if (daysRemaining <= 7) return 'text-red-600';
    if (daysRemaining <= 14) return 'text-orange-600';
    if (daysRemaining <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all ${
        isDragging ? 'shadow-lg rotate-2' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>

        <div className="flex-1 min-w-0">
          {/* Customer Name */}
          <h4 className="font-medium text-sm truncate">
            {renewal.account?.name || 'Unknown'}
          </h4>

          {/* Policy Info */}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            {renewal.policy_number && <span>#{renewal.policy_number}</span>}
            {renewal.carrier && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {renewal.carrier}
              </span>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between mt-2">
            {/* Premium */}
            <span className="text-xs font-medium">
              {renewal.current_premium ? formatCurrency(renewal.current_premium) : 'N/A'}
            </span>

            {/* Days Remaining */}
            <div className="flex items-center gap-2">
              {renewal.risk_score !== null && renewal.risk_score >= 70 && (
                <Badge variant="destructive" className="text-[10px] px-1 py-0">
                  <TrendingUp className="h-2 w-2 mr-0.5" />
                  High Risk
                </Badge>
              )}
              <span className={`text-xs font-medium ${getDaysColor()}`}>
                {daysRemaining !== null
                  ? daysRemaining < 0
                    ? `${Math.abs(daysRemaining)}d ago`
                    : `${daysRemaining}d`
                  : ''}
              </span>
            </div>
          </div>

          {/* Priority indicator */}
          {renewal.priority && renewal.priority !== 'normal' && (
            <div className="mt-2">
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  renewal.priority === 'urgent'
                    ? 'border-red-500 text-red-500'
                    : renewal.priority === 'high'
                    ? 'border-orange-500 text-orange-500'
                    : ''
                }`}
              >
                <AlertTriangle className="h-2 w-2 mr-1" />
                {renewal.priority}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
