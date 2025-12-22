import { useState } from "react";
import { useActiveWorkspaces, useCompletedWorkspaces, useWorkspaceSubscription, useDeleteWorkspace, useDeleteAllProcessing, type Workspace } from "@/hooks/useWorkspaces";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, CheckCircle2, XCircle, Clock, Search, Filter, Trash2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const WorkspaceListViewPage = () => {
  const navigate = useNavigate();
  // Enable real-time updates
  useWorkspaceSubscription();

  const { data: activeWorkspaces, isLoading: loadingActive } = useActiveWorkspaces();
  const { data: completedWorkspaces, isLoading: loadingCompleted } = useCompletedWorkspaces();
  const deleteAllProcessing = useDeleteAllProcessing();

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("all");

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

  // Filter workspaces based on search and filters
  const filterWorkspaces = (workspaces: Workspace[] | undefined) => {
    if (!workspaces) return [];
    
    return workspaces.filter((workspace) => {
      const matchesSearch = 
        workspace.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        workspace.task_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        workspace.client_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || workspace.status === statusFilter;
      const matchesTaskType = taskTypeFilter === "all" || workspace.task_type === taskTypeFilter;
      
      return matchesSearch && matchesStatus && matchesTaskType;
    });
  };

  const filteredActive = filterWorkspaces(activeWorkspaces);
  const filteredCompleted = filterWorkspaces(completedWorkspaces);

  // Get unique task types for filter dropdown
  const allWorkspaces = [...(activeWorkspaces || []), ...(completedWorkspaces || [])];
  const uniqueTaskTypes = Array.from(new Set(allWorkspaces.map(w => w.task_type)));

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Workspace</h1>
          <p className="text-muted-foreground">
            Monitor your quote comparison jobs and review completed analyses
          </p>
        </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, type, or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            {/* Task Type Filter */}
            <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by task type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Task Types</SelectItem>
                {uniqueTaskTypes.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Working in background</CardTitle>
              <CardDescription>Currently processing documents ({filteredActive.length})</CardDescription>
            </div>
            {filteredActive.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All ({filteredActive.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Delete All Processing Jobs?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {filteredActive.length} workspace(s) that are currently processing or idle.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAllProcessing.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteAllProcessing.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete All
                        </>
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingActive ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredActive.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery || statusFilter !== "all" || taskTypeFilter !== "all" 
                ? "No active jobs match your filters"
                : "No active jobs"}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredActive.map((workspace) => (
                <WorkspaceItem key={workspace.id} workspace={workspace} onClick={() => navigate(`/workspace/${workspace.id}`)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Completed and failed jobs ({filteredCompleted.length})</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCompleted ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCompleted.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery || statusFilter !== "all" || taskTypeFilter !== "all"
                ? "No completed jobs match your filters"
                : "No completed jobs"}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCompleted.map((workspace) => (
                <WorkspaceItem key={workspace.id} workspace={workspace} onClick={() => navigate(`/workspace/${workspace.id}`)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  );
};

interface WorkspaceItemProps {
  workspace: Workspace;
  onClick?: () => void;
}

function WorkspaceItem({ workspace, onClick }: WorkspaceItemProps) {
  const deleteWorkspace = useDeleteWorkspace();

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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card click
  };

  return (
    <div
      className="flex items-start justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-4 flex-1">
        {getStatusIcon(workspace.status)}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title and Status */}
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base truncate">{workspace.name}</h3>
            {getStatusBadge(workspace.status)}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            {/* Task Type */}
            <div>
              <span className="text-muted-foreground">Type:</span>{" "}
              <span className="font-medium">{workspace.task_type}</span>
            </div>

            {/* Client (Insured) */}
            {workspace.client_name && (
              <div>
                <span className="text-muted-foreground">Client:</span>{" "}
                <span className="font-medium">{workspace.client_name}</span>
              </div>
            )}

            {/* User (Created By) */}
            <div>
              <span className="text-muted-foreground">User:</span>{" "}
              <span className="font-medium">{workspace.creator_name || "Unknown"}</span>
            </div>

            {/* Last Updated */}
            <div>
              <span className="text-muted-foreground">Updated:</span>{" "}
              <span className="font-medium">
                {formatDistanceToNow(new Date(workspace.updated_at), { addSuffix: true })}
              </span>
            </div>

            {/* Full date on second row */}
            <div className="col-span-2 text-xs text-muted-foreground">
              {format(new Date(workspace.updated_at), "MMM d, yyyy 'at' h:mm a")}
            </div>
          </div>

          {/* Description/Notes */}
          {workspace.notes && (
            <p className="text-sm text-muted-foreground truncate">{workspace.notes}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-2" onClick={handleDelete}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{workspace.name}" and all associated data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteWorkspace.mutate(workspace.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteWorkspace.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export default WorkspaceListViewPage;
