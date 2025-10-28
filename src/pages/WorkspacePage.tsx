import { useParams, Link } from 'react-router-dom';
import { useWorkspace, useWorkspaceDocuments, useActiveWorkspaces, useCompletedWorkspaces, useWorkspaceSubscription, type Workspace } from '@/hooks/useWorkspaces';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Clock, Eye, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useEffect } from 'react';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  
  // Enable real-time updates
  useWorkspaceSubscription();
  
  // Fetch workspaces
  const { data: activeWorkspaces = [], isLoading: activeLoading } = useActiveWorkspaces();
  const { data: completedWorkspaces = [], isLoading: completedLoading } = useCompletedWorkspaces();
  
  // If we have a specific workspace ID, fetch its details
  const { data: workspace, isLoading: workspaceLoading } = useWorkspace(id);
  const { data: documents = [] } = useWorkspaceDocuments(id);

  const isLoading = activeLoading || completedLoading || (id && workspaceLoading);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // If viewing a specific workspace
  if (id && workspace) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6 space-y-8">
          <div>
            <Link to="/workspace" className="text-sm text-primary hover:underline mb-2 inline-block">
              ← Back to all workspaces
            </Link>
            <h1 className="text-3xl font-bold">{workspace.name}</h1>
            <p className="text-muted-foreground mt-2">
              {workspace.description || 'No description provided'}
            </p>
          </div>

          <Card className="p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="mt-1">{getStatusBadge(workspace.status as Workspace['status'])}</div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Task Type</p>
                <p className="font-medium mt-1">{workspace.task_type}</p>
              </div>
              {workspace.client_name && (
                <div>
                  <p className="text-sm text-muted-foreground">Client</p>
                  <p className="font-medium mt-1">{workspace.client_name}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium mt-1">
                  {formatDistanceToNow(new Date(workspace.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            {workspace.notes && (
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="mt-1">{workspace.notes}</p>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents ({documents.length})
              </h3>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{doc.file_name || 'Unnamed document'}</span>
                      {doc.role && (
                        <Badge variant="outline" className="text-xs">{doc.role}</Badge>
                      )}
                    </div>
                    {doc.file_url && (
                      <a 
                        href={doc.file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        View
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Default view: show all workspaces
  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Workspaces</h1>
          <p className="text-muted-foreground mt-2">
            Monitor your active workspaces and review completed analyses
          </p>
        </div>

        {/* Active Workspaces */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Active Workspaces</h2>
          <Card>
            {activeWorkspaces.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No active workspaces
              </div>
            ) : (
              <div className="divide-y">
                {activeWorkspaces.map((workspace) => (
                  <WorkspaceItem key={workspace.id} workspace={workspace} />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Completed Workspaces */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Completed</h2>
          <Card>
            {completedWorkspaces.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No completed workspaces
              </div>
            ) : (
              <div className="divide-y">
                {completedWorkspaces.map((workspace) => (
                  <WorkspaceItem key={workspace.id} workspace={workspace} showActions />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function getStatusBadge(status: Workspace['status']) {
  switch (status) {
    case 'idle':
      return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Idle</Badge>;
    case 'processing':
      return <Badge className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Processing</Badge>;
    case 'completed':
      return <Badge variant="default" className="flex items-center gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
  }
}

function WorkspaceItem({ workspace, showActions }: { workspace: Workspace; showActions?: boolean }) {
  return (
    <div className="p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="font-medium truncate">{workspace.name}</h3>
          {getStatusBadge(workspace.status)}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{workspace.task_type}</span>
          {workspace.client_name && <span>• {workspace.client_name}</span>}
          <span>
            • {(workspace.status === 'completed' as const || workspace.status === 'failed' as const)
              ? `Updated ${formatDistanceToNow(new Date(workspace.updated_at), { addSuffix: true })}`
              : `Created ${formatDistanceToNow(new Date(workspace.created_at), { addSuffix: true })}`}
          </span>
        </div>
        {workspace.description && (
          <p className="text-sm text-muted-foreground mt-1 truncate">{workspace.description}</p>
        )}
      </div>

      {showActions && (
        <Link to={`/workspace/${workspace.id}`}>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            View Details
          </Button>
        </Link>
      )}
    </div>
  );
}
