import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useMarketingAutomations,
  useDeleteAutomation,
  useToggleAutomation,
  type TriggerType,
} from '@/hooks/useMarketingAutomations';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  PlayCircle,
  PauseCircle,
  Zap,
  Users,
  Mail,
  MessageSquare,
  Gift,
  Calendar,
  RefreshCw,
  Search,
  MoreVertical,
  Copy,
  BarChart3,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TRIGGER_ICONS: Record<TriggerType, React.ComponentType<{ className?: string }>> = {
  birthday: Gift,
  policy_renewal: RefreshCw,
  new_customer: Users,
  claim_closed: Zap,
  policy_anniversary: Calendar,
  no_contact: Mail,
  tag_added: Zap,
  manual: PlayCircle,
  api: Zap,
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  birthday: 'Birthday',
  policy_renewal: 'Policy Renewal',
  new_customer: 'New Customer',
  claim_closed: 'Claim Closed',
  policy_anniversary: 'Policy Anniversary',
  no_contact: 'No Contact',
  tag_added: 'Tag Added',
  manual: 'Manual',
  api: 'API Triggered',
};

export default function MarketingAutomationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrigger, setFilterTrigger] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: automations, isLoading } = useMarketingAutomations({
    trigger_type: filterTrigger !== 'all' ? (filterTrigger as TriggerType) : undefined,
    is_active: filterStatus === 'all' ? undefined : filterStatus === 'active',
  });

  const deleteAutomation = useDeleteAutomation();
  const toggleAutomation = useToggleAutomation();

  const filteredAutomations = automations?.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAutomation.mutateAsync(deleteId);
      setDeleteId(null);
    } catch (error) {
      // Toast handled by hook
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await toggleAutomation.mutateAsync({ id, is_active: !currentStatus });
    } catch (error) {
      // Toast handled by hook
    }
  };

  const stats = {
    total: automations?.length || 0,
    active: automations?.filter((a) => a.is_active).length || 0,
    totalEnrollments: automations?.reduce((sum, a) => sum + (a.total_enrollments || 0), 0) || 0,
    activeEnrollments: automations?.reduce((sum, a) => sum + (a.active_enrollments || 0), 0) || 0,
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Marketing Automations</h1>
            <p className="text-muted-foreground">
              Automated workflows for birthday greetings, renewal reminders, and more
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/marketing/templates')}>
              <Mail className="h-4 w-4 mr-2" />
              Templates
            </Button>
            <Button onClick={() => navigate('/marketing/automations/new')}>
              <Plus className="h-4 w-4 mr-2" />
              Create Automation
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Automations</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Zap className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold">{stats.active}</p>
                </div>
                <PlayCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Enrollments</p>
                  <p className="text-2xl font-bold">{stats.totalEnrollments.toLocaleString()}</p>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Enrollments</p>
                  <p className="text-2xl font-bold">{stats.activeEnrollments.toLocaleString()}</p>
                </div>
                <RefreshCw className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search automations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterTrigger} onValueChange={setFilterTrigger}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Triggers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Triggers</SelectItem>
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Automations Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-full" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filteredAutomations?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Zap className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No automations yet</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                Create automated workflows to send birthday greetings, renewal reminders,
                welcome sequences, and more.
              </p>
              <Button onClick={() => navigate('/marketing/automations/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Automation
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAutomations?.map((automation) => {
              const TriggerIcon = TRIGGER_ICONS[automation.trigger_type] || Zap;
              return (
                <Card key={automation.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <TriggerIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{automation.name}</CardTitle>
                          <CardDescription className="line-clamp-1">
                            {TRIGGER_LABELS[automation.trigger_type]}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={automation.is_active ? 'default' : 'secondary'}>
                        {automation.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {automation.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {automation.description}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-center p-2 bg-muted rounded-lg">
                        <div className="font-semibold">{automation.total_enrollments || 0}</div>
                        <div className="text-xs text-muted-foreground">Total Enrolled</div>
                      </div>
                      <div className="text-center p-2 bg-muted rounded-lg">
                        <div className="font-semibold">{automation.active_enrollments || 0}</div>
                        <div className="text-xs text-muted-foreground">Active</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate(`/marketing/automations/${automation.id}`)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggle(automation.id, automation.is_active)}
                      >
                        {automation.is_active ? (
                          <PauseCircle className="h-4 w-4" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => navigate(`/marketing/automations/${automation.id}/analytics`)}
                          >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            View Analytics
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            toast({ title: 'Coming Soon', description: 'Duplicate feature coming soon' });
                          }}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteId(automation.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this automation? Active enrollments will be cancelled.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
