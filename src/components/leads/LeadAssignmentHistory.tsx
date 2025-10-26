// src/components/leads/LeadAssignmentHistory.tsx

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeadAssignments } from '@/hooks/useAssignmentRules';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LeadAssignmentHistoryProps {
  leadId: string;
}

export function LeadAssignmentHistory({ leadId }: LeadAssignmentHistoryProps) {
  const { data: assignments, isLoading, error } = useLeadAssignments(leadId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load assignment history: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!assignments || assignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Assignment History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No assignment history yet
          </p>
        </CardContent>
      </Card>
    );
  }

  const getMethodBadge = (method: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      automatic: 'default',
      manual: 'secondary',
      reassignment: 'outline',
    };
    return variants[method] || 'outline';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Assignment History</CardTitle>
        <CardDescription>
          {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {assignments.map((assignment, index) => (
            <div
              key={assignment.id}
              className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0"
            >
              <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    Producer {assignment.assigned_to.substring(0, 8)}...
                  </span>
                  <Badge variant={getMethodBadge(assignment.assignment_method)}>
                    {assignment.assignment_method}
                  </Badge>
                  {index === 0 && (
                    <Badge variant="outline" className="text-xs">Current</Badge>
                  )}
                </div>
                {assignment.reason && (
                  <p className="text-sm text-muted-foreground">{assignment.reason}</p>
                )}
                {assignment.assigned_by && (
                  <p className="text-xs text-muted-foreground">
                    By: {assignment.assigned_by.substring(0, 8)}...
                  </p>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(assignment.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
