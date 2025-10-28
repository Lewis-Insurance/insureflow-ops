import { useActiveWorkspaces, useCompletedWorkspaces, useWorkspaceSubscription } from "@/hooks/useWorkspaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const WorkspacePage = () => {
  // Enable real-time updates
  useWorkspaceSubscription();

  const { data: activeWorkspaces, isLoading: loadingActive } = useActiveWorkspaces();
  const { data: completedWorkspaces, isLoading: loadingCompleted } = useCompletedWorkspaces();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      idle: "outline",
      processing: "default",
      completed: "secondary",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Workspace</h1>
        <p className="text-muted-foreground">
          Monitor your quote comparison jobs and review completed analyses
        </p>
      </div>

      {/* Active Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Working in background</CardTitle>
          <CardDescription>Currently processing documents</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingActive ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !activeWorkspaces || activeWorkspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active jobs
            </div>
          ) : (
            <div className="space-y-4">
              {activeWorkspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(workspace.status)}
                    <div>
                      <h3 className="font-semibold">{workspace.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {workspace.task_type}
                        {workspace.client_name && ` • ${workspace.client_name}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Started {formatDistanceToNow(new Date(workspace.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(workspace.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Completed and failed jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCompleted ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !completedWorkspaces || completedWorkspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No completed jobs
            </div>
          ) : (
            <div className="space-y-4">
              {completedWorkspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => {
                    // Navigate to workspace detail
                    window.location.href = `/workspace/${workspace.id}`;
                  }}
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(workspace.status)}
                    <div>
                      <h3 className="font-semibold">{workspace.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {workspace.task_type}
                        {workspace.client_name && ` • ${workspace.client_name}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Completed {formatDistanceToNow(new Date(workspace.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(workspace.status)}
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkspacePage;
