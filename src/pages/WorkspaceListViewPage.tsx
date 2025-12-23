import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useActiveWorkspaces,
  useCompletedWorkspaces,
  useWorkspaceSubscription,
  useDeleteAllProcessing,
  useWorkspaceTaskTypes
} from "@/hooks/useWorkspaces";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
import {
  Loader2,
  Search,
  Filter,
  Trash2,
  AlertTriangle,
  Building2,
  UserPlus,
  FileText,
  Link as LinkIcon,
  X
} from "lucide-react";
import { WorkspaceItem } from "@/components/workspace/WorkspaceItem";
import type { WorkspaceWithEntities, WorkspaceFilters } from "@/types/workspace";

const WorkspaceListViewPage = () => {
  const navigate = useNavigate();

  // Enable real-time updates
  useWorkspaceSubscription();

  const { data: activeWorkspaces, isLoading: loadingActive } = useActiveWorkspaces();
  const { data: completedWorkspaces, isLoading: loadingCompleted } = useCompletedWorkspaces();
  const { data: taskTypes } = useWorkspaceTaskTypes();
  const deleteAllProcessing = useDeleteAllProcessing();

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter workspaces based on search and filters
  const filterWorkspaces = (workspaces: WorkspaceWithEntities[] | undefined) => {
    if (!workspaces) return [];

    return workspaces.filter((workspace) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        workspace.name.toLowerCase().includes(searchLower) ||
        workspace.task_type.toLowerCase().includes(searchLower) ||
        workspace.client_name?.toLowerCase().includes(searchLower) ||
        workspace.account_name?.toLowerCase().includes(searchLower) ||
        workspace.lead_name?.toLowerCase().includes(searchLower) ||
        workspace.policy_number?.toLowerCase().includes(searchLower);

      // Status filter
      const matchesStatus = statusFilter === "all" || workspace.status === statusFilter;

      // Task type filter
      const matchesTaskType = taskTypeFilter === "all" || workspace.task_type === taskTypeFilter;

      // Entity type filter
      const matchesEntityType = entityTypeFilter === "all" ||
        workspace.linked_entity_type === entityTypeFilter;

      // Unlinked only filter
      const matchesUnlinked = !unlinkedOnly || !workspace.linked_entity_type;

      return matchesSearch && matchesStatus && matchesTaskType && matchesEntityType && matchesUnlinked;
    });
  };

  const filteredActive = filterWorkspaces(activeWorkspaces);
  const filteredCompleted = filterWorkspaces(completedWorkspaces);

  // Stats for filter badges
  const stats = useMemo(() => {
    const all = [...(activeWorkspaces || []), ...(completedWorkspaces || [])];
    return {
      total: all.length,
      unlinked: all.filter(w => !w.linked_entity_type).length,
      accounts: all.filter(w => w.linked_entity_type === 'account').length,
      leads: all.filter(w => w.linked_entity_type === 'lead').length,
      policies: all.filter(w => w.linked_entity_type === 'policy').length,
    };
  }, [activeWorkspaces, completedWorkspaces]);

  // Selection handlers
  const toggleSelection = (id: string, selected: boolean) => {
    const newSet = new Set(selectedIds);
    if (selected) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = (workspaces: WorkspaceWithEntities[]) => {
    setSelectedIds(new Set(workspaces.map(w => w.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setTaskTypeFilter("all");
    setEntityTypeFilter("all");
    setUnlinkedOnly(false);
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" ||
    taskTypeFilter !== "all" || entityTypeFilter !== "all" || unlinkedOnly;

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Workspace</h1>
            <p className="text-muted-foreground">
              Monitor AI processing jobs and review completed analyses
            </p>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <LinkIcon className="h-3 w-3" />
              {stats.unlinked} unlinked
            </Badge>
            <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
              <Building2 className="h-3 w-3" />
              {stats.accounts}
            </Badge>
            <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200">
              <UserPlus className="h-3 w-3" />
              {stats.leads}
            </Badge>
            <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 dark:bg-green-900/50 dark:text-green-200">
              <FileText className="h-3 w-3" />
              {stats.policies}
            </Badge>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, client, policy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
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
                  <SelectValue placeholder="Task Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {taskTypes?.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Entity Type Filter - NEW */}
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Linked To" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Records</SelectItem>
                  <SelectItem value="account">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Accounts
                    </span>
                  </SelectItem>
                  <SelectItem value="lead">
                    <span className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" /> Leads
                    </span>
                  </SelectItem>
                  <SelectItem value="policy">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Policies
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Additional filters row */}
            <div className="flex items-center gap-4 mt-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={unlinkedOnly}
                  onCheckedChange={(checked) => setUnlinkedOnly(!!checked)}
                />
                Show unlinked only
              </label>

              {/* Clear filters button */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <Card className="border-primary">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedIds.size} workspace(s) selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Jobs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Working in background</CardTitle>
                <CardDescription>
                  Currently processing documents ({filteredActive.length})
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {filteredActive.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectAll(filteredActive)}
                    >
                      Select All
                    </Button>
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
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingActive ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredActive.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {hasActiveFilters ? "No active jobs match your filters" : "No active jobs"}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredActive.map((workspace) => (
                  <WorkspaceItem
                    key={workspace.id}
                    workspace={workspace}
                    onClick={() => navigate(`/workspace/${workspace.id}`)}
                    selected={selectedIds.has(workspace.id)}
                    onSelect={(selected) => toggleSelection(workspace.id, selected)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              Completed and failed jobs ({filteredCompleted.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCompleted ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCompleted.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {hasActiveFilters ? "No completed jobs match your filters" : "No completed jobs"}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCompleted.map((workspace) => (
                  <WorkspaceItem
                    key={workspace.id}
                    workspace={workspace}
                    onClick={() => navigate(`/workspace/${workspace.id}`)}
                    selected={selectedIds.has(workspace.id)}
                    onSelect={(selected) => toggleSelection(workspace.id, selected)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default WorkspaceListViewPage;
