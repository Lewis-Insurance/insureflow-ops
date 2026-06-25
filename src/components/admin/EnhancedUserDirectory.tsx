/**
 * Unified Admin User Management
 * 
 * Auth is canonical for identity/email/existence via admin-list-users.
 * profiles is canonical for app/admin metadata such as role, status,
 * admin notes, and soft-delete state.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Search,
  MoreVertical,
  UserX,
  UserCheck,
  Trash2,
  Pencil,
  Ban,
  RefreshCw,
  UserPlus,
  Key,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAgencyMemberships } from '@/hooks/useAgencyWorkspace';

interface UserProvisioningMetadata {
  is_provisioned: boolean;
  active_membership_count: number;
  has_active_default_membership: boolean;
  default_agency_status: string | null;
  default_agency_name: string | null;
  active_memberships: Array<{
    agency_workspace_id: string;
    role: string;
    status: string;
  }>;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: 'active' | 'disabled' | 'banned' | null;
  is_staff?: boolean;
  default_agency_workspace_id?: string | null;
  last_seen_at: string | null;
  created_at: string;
  admin_notes: string | null;
  deleted_at: string | null;
  provisioning?: UserProvisioningMetadata;
  usage_metrics?: {
    api_calls: number;
    tokens_used: number;
    cost_spent: number;
  };
}

interface AgencyWorkspaceOption {
  id: string;
  name: string;
}

type SortField = 'name' | 'email' | 'created_at' | 'last_seen_at' | 'role' | 'status';
type SortDirection = 'asc' | 'desc';
type UserStatus = 'active' | 'disabled' | 'banned';
type ActionDialog = 'disable' | 'enable' | 'ban' | 'delete' | 'notes' | null;

const ROLE_OPTIONS = ['customer', 'staff', 'admin'];

const DEFAULT_USAGE = { api_calls: 0, tokens_used: 0, cost_spent: 0 };

const isStaffAdminRole = (value: string | null | undefined) => value === 'staff' || value === 'admin';

const isActiveUserProfile = (user: UserProfile) => (user.status || 'active') === 'active' && !user.deleted_at;

const hasValidDefaultAgencyMembership = (user: UserProfile) => {
  return Boolean(
    user.default_agency_workspace_id &&
    user.provisioning?.has_active_default_membership &&
    user.provisioning?.default_agency_status === 'active'
  );
};

const userNeedsWorkspaceForStaffRole = (user: UserProfile, targetRole: string) => {
  return isStaffAdminRole(targetRole) && isActiveUserProfile(user) && !hasValidDefaultAgencyMembership(user);
};

const getProvisioningWarning = (user: UserProfile) => {
  if (user.provisioning?.is_provisioned !== false) return null;

  const issues: string[] = [];
  if (!user.default_agency_workspace_id) issues.push('missing default workspace');
  if (user.default_agency_workspace_id && user.provisioning.default_agency_status !== 'active') {
    issues.push('default workspace inactive');
  }
  if (!user.provisioning.has_active_default_membership) issues.push('missing active membership');

  return `Provisioning issue${issues.length ? `: ${issues.join(', ')}` : ''}`;
};

const getErrorMessage = async (error: unknown, fallback: string) => {
  const context = (error as { context?: unknown } | null)?.context;

  if (typeof Response !== 'undefined' && context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (payload?.error) {
        return payload.code ? `${payload.error} (${payload.code})` : payload.error;
      }
    } catch {
      // Fall through to the generic error message below.
    }
  }

  return error instanceof Error ? error.message : fallback;
};

export function EnhancedUserDirectory() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Create user form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('customer');
  const [createAgencyWorkspaceId, setCreateAgencyWorkspaceId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit user dialog
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('customer');
  const [editAgencyWorkspaceId, setEditAgencyWorkspaceId] = useState('');

  // Password reset dialog
  const [passwordResetUser, setPasswordResetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Admin metadata action dialogs
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialog>(null);
  const [notes, setNotes] = useState('');
  const [statusAgencyWorkspaceId, setStatusAgencyWorkspaceId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const { toast } = useToast();
  const {
    data: agencyMemberships = [],
    isLoading: isLoadingAgencyWorkspaces,
    error: agencyWorkspacesError,
  } = useAgencyMemberships();

  const agencyWorkspaceOptions = useMemo<AgencyWorkspaceOption[]>(() => {
    const optionsById = new Map<string, AgencyWorkspaceOption>();

    for (const membership of agencyMemberships) {
      const agency = membership.agency;
      if (!agency || agency.status !== 'active') continue;
      optionsById.set(agency.id, { id: agency.id, name: agency.name });
    }

    return Array.from(optionsById.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [agencyMemberships]);

  useEffect(() => {
    if (!agencyWorkspacesError) return;

    toast({
      title: 'Workspace options unavailable',
      description: 'Could not load your active agency workspaces for provisioning.',
      variant: 'destructive',
    });
  }, [agencyWorkspacesError, toast]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('admin-list-users');
      if (error) throw error;

      const listedUsers: UserProfile[] = data?.users || [];

      const usersWithMetrics = await Promise.all(
        listedUsers.map(async (user) => {
          const { data: metrics } = await supabase
            .from('user_usage_metrics')
            .select('api_calls, tokens_used, cost_spent')
            .eq('user_id', user.id)
            .order('period_start', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...user,
            usage_metrics: {
              api_calls: metrics?.api_calls ?? 0,
              tokens_used: metrics?.tokens_used ?? 0,
              cost_spent: metrics?.cost_spent ?? 0,
            },
          };
        })
      );

      setUsers(usersWithMetrics);
    } catch (error: unknown) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: await getErrorMessage(error, 'Failed to fetch users'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const visibleUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = users.filter((user) => {
      if (user.deleted_at) return false;
      if (statusFilter !== 'all' && (user.status || 'active') !== statusFilter) return false;
      if (roleFilter !== 'all' && (user.role || 'customer') !== roleFilter) return false;
      if (!query) return true;

      return (
        user.email.toLowerCase().includes(query) ||
        (user.full_name || '').toLowerCase().includes(query)
      );
    });

    return filtered.sort((a, b) => {
      const getValue = (user: UserProfile) => {
        switch (sortField) {
          case 'name':
            return user.full_name || '';
          case 'email':
            return user.email || '';
          case 'last_seen_at':
            return user.last_seen_at || '';
          case 'role':
            return user.role || '';
          case 'status':
            return user.status || 'active';
          case 'created_at':
          default:
            return user.created_at || '';
        }
      };

      const aValue = getValue(a);
      const bValue = getValue(b);
      const comparison = aValue.localeCompare(bValue);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [users, searchQuery, statusFilter, roleFilter, sortField, sortDirection]);

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();

    if (!email || !password || !fullName) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in name, email, and password',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: 'Validation Error',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    const createRequiresWorkspace = isStaffAdminRole(role);
    if (createRequiresWorkspace && !createAgencyWorkspaceId) {
      toast({
        title: 'Workspace Required',
        description: 'Select an active agency workspace before creating a staff/admin user.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    try {
      const { error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email,
          password,
          fullName,
          role,
          agencyWorkspaceId: createRequiresWorkspace ? createAgencyWorkspaceId : undefined,
        },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `User ${email} created successfully`,
      });

      setEmail('');
      setPassword('');
      setFullName('');
      setRole('customer');
      setCreateAgencyWorkspaceId('');
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: await getErrorMessage(error, 'Failed to create user'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const openEditDialog = (user: UserProfile) => {
    setEditUser(user);
    setEditFullName(user.full_name || '');
    setEditRole(user.role || 'customer');
    setEditAgencyWorkspaceId(
      user.default_agency_workspace_id && agencyWorkspaceOptions.some((option) => option.id === user.default_agency_workspace_id)
        ? user.default_agency_workspace_id
        : ''
    );
  };

  const handleEditUser = async () => {
    if (!editUser) return;

    const editRequiresWorkspace = userNeedsWorkspaceForStaffRole(editUser, editRole);
    if (editRequiresWorkspace && !editAgencyWorkspaceId) {
      toast({
        title: 'Workspace Required',
        description: 'Select an active agency workspace before making this user staff/admin.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          action: 'edit',
          userId: editUser.id,
          fullName: editFullName,
          role: editRole,
          agencyWorkspaceId: editRequiresWorkspace ? editAgencyWorkspaceId : undefined,
        },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User updated successfully',
      });

      setEditUser(null);
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: await getErrorMessage(error, 'Failed to update user'),
        variant: 'destructive',
      });
    }
  };

  const openPasswordResetDialog = (user: UserProfile) => {
    setPasswordResetUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handlePasswordReset = async () => {
    if (!passwordResetUser) return;

    if (!newPassword || !confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in both password fields',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: 'Validation Error',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    setIsResettingPassword(true);

    try {
      const { error } = await supabase.functions.invoke('admin-update-password', {
        body: {
          userId: passwordResetUser.id,
          newPassword,
        },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Password updated for ${passwordResetUser.full_name}`,
      });

      setPasswordResetUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: await getErrorMessage(error, 'Failed to update password'),
        variant: 'destructive',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleStatusChange = async (user: UserProfile, newStatus: UserStatus, agencyWorkspaceId?: string) => {
    const statusRequiresWorkspace = newStatus === 'active' && isStaffAdminRole(user.role) && !hasValidDefaultAgencyMembership(user);
    if (statusRequiresWorkspace && !agencyWorkspaceId) {
      toast({
        title: 'Workspace Required',
        description: 'Select an active agency workspace before reactivating this staff/admin user.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsProcessing(true);

      const { error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          action: 'status',
          userId: user.id,
          status: newStatus,
          agencyWorkspaceId: statusRequiresWorkspace ? agencyWorkspaceId : undefined,
        },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `User status updated to ${newStatus}`,
      });

      fetchUsers();
      closeActionDialog();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: await getErrorMessage(error, 'Failed to update user status'),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSoftDelete = async (userId: string) => {
    try {
      setIsProcessing(true);

      const { error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          action: 'soft_delete',
          userId,
        },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User has been soft-deleted',
      });

      fetchUsers();
      closeActionDialog();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: await getErrorMessage(error, 'Failed to delete user'),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedUser) return;

    try {
      setIsProcessing(true);

      const { error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          action: 'notes',
          userId: selectedUser.id,
          adminNotes: notes,
        },
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Admin notes saved',
      });

      fetchUsers();
      closeActionDialog();
      setNotes('');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: await getErrorMessage(error, 'Failed to save notes'),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };


  const closeActionDialog = () => {
    setActionDialog(null);
    setSelectedUser(null);
    setStatusAgencyWorkspaceId('');
  };

  const getStatusBadge = (status: string | null) => {
    switch (status || 'active') {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'disabled':
        return <Badge variant="secondary">Disabled</Badge>;
      case 'banned':
        return <Badge variant="destructive">Banned</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Never';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New User</CardTitle>
          <CardDescription>
            Create an Auth user and authoritative profile metadata in one admin workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="grid gap-4 md:grid-cols-6 md:items-end">
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isCreating}
                minLength={8}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="role">Role</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  setRole(value);
                  if (!isStaffAdminRole(value)) setCreateAgencyWorkspaceId('');
                }}
                disabled={isCreating}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isStaffAdminRole(role) && (
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="create-agency-workspace">Workspace</Label>
                <Select
                  value={createAgencyWorkspaceId}
                  onValueChange={setCreateAgencyWorkspaceId}
                  disabled={isCreating || isLoadingAgencyWorkspaces || agencyWorkspaceOptions.length === 0}
                >
                  <SelectTrigger id="create-agency-workspace">
                    <SelectValue placeholder={isLoadingAgencyWorkspaces ? 'Loading...' : 'Select workspace'} />
                  </SelectTrigger>
                  <SelectContent>
                    {agencyWorkspaceOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {agencyWorkspaceOptions.length === 0 && !isLoadingAgencyWorkspaces && (
                  <p className="text-xs text-muted-foreground">No active agency workspaces available.</p>
                )}
              </div>
            )}
            <Button type="submit" disabled={isCreating} className="md:col-span-1">
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create User
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Search, filter, and manage users from the canonical Auth + profile admin list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 mb-4 lg:flex-row">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full lg:w-[160px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
              <SelectTrigger className="w-full lg:w-[160px]">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Created</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="last_seen_at">Last Seen</SelectItem>
                <SelectItem value="role">Role</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as SortDirection)}>
              <SelectTrigger className="w-full lg:w-[140px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Usage (Latest)</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.full_name || 'No name'}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                        {getProvisioningWarning(user) && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{getProvisioningWarning(user)}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {user.role || 'customer'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatLastSeen(user.last_seen_at)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{user.usage_metrics?.api_calls || DEFAULT_USAGE.api_calls} calls</div>
                        <div className="text-muted-foreground">
                          {formatCurrency(user.usage_metrics?.cost_spent || DEFAULT_USAGE.cost_spent)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEditDialog(user)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Name/Role
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPasswordResetDialog(user)}>
                            <Key className="h-4 w-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setNotes(user.admin_notes || '');
                              setActionDialog('notes');
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Admin Notes
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {(user.status || 'active') === 'active' && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setActionDialog('disable');
                              }}
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Disable
                            </DropdownMenuItem>
                          )}
                          {(user.status === 'disabled' || user.status === 'banned') && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setStatusAgencyWorkspaceId(
                                  user.default_agency_workspace_id && agencyWorkspaceOptions.some((option) => option.id === user.default_agency_workspace_id)
                                    ? user.default_agency_workspace_id
                                    : ''
                                );
                                setActionDialog('enable');
                              }}
                            >
                              <UserCheck className="h-4 w-4 mr-2" />
                              Enable
                            </DropdownMenuItem>
                          )}
                          {user.status !== 'banned' && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setActionDialog('ban');
                              }}
                              className="text-destructive"
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Ban User
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setActionDialog('delete');
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Soft Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {visibleUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No users match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update profile name and role for {editUser?.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input id="edit-name" value={editFullName} onChange={(event) => setEditFullName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editRole}
                onValueChange={(value) => {
                  setEditRole(value);
                  if (!isStaffAdminRole(value)) setEditAgencyWorkspaceId('');
                }}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([...ROLE_OPTIONS, editRole])).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editUser && userNeedsWorkspaceForStaffRole(editUser, editRole) && (
              <div className="space-y-2">
                <Label htmlFor="edit-agency-workspace">Workspace</Label>
                <Select
                  value={editAgencyWorkspaceId}
                  onValueChange={setEditAgencyWorkspaceId}
                  disabled={isLoadingAgencyWorkspaces || agencyWorkspaceOptions.length === 0}
                >
                  <SelectTrigger id="edit-agency-workspace">
                    <SelectValue placeholder={isLoadingAgencyWorkspaces ? 'Loading...' : 'Select workspace'} />
                  </SelectTrigger>
                  <SelectContent>
                    {agencyWorkspaceOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Required because this active staff/admin user does not have a valid default workspace membership.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditUser}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordResetUser} onOpenChange={(open) => !open && setPasswordResetUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {passwordResetUser?.full_name} ({passwordResetUser?.email}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={isResettingPassword}
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isResettingPassword}
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordResetUser(null)} disabled={isResettingPassword}>
              Cancel
            </Button>
            <Button onClick={handlePasswordReset} disabled={isResettingPassword}>
              {isResettingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedUser && (
        <>
          {(actionDialog === 'disable' || actionDialog === 'enable' || actionDialog === 'ban') && (
            <AlertDialog open={true} onOpenChange={closeActionDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {actionDialog === 'disable' && 'Disable User'}
                    {actionDialog === 'enable' && 'Enable User'}
                    {actionDialog === 'ban' && 'Ban User'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to {actionDialog} {selectedUser.full_name} ({selectedUser.email})?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {actionDialog === 'enable' && isStaffAdminRole(selectedUser.role) && !hasValidDefaultAgencyMembership(selectedUser) && (
                  <div className="space-y-2 py-2">
                    <Label htmlFor="status-agency-workspace">Workspace</Label>
                    <Select
                      value={statusAgencyWorkspaceId}
                      onValueChange={setStatusAgencyWorkspaceId}
                      disabled={isProcessing || isLoadingAgencyWorkspaces || agencyWorkspaceOptions.length === 0}
                    >
                      <SelectTrigger id="status-agency-workspace">
                        <SelectValue placeholder={isLoadingAgencyWorkspaces ? 'Loading...' : 'Select workspace'} />
                      </SelectTrigger>
                      <SelectContent>
                        {agencyWorkspaceOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Required because this staff/admin user lacks a valid active default workspace membership.
                    </p>
                  </div>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const nextStatus: UserStatus = actionDialog === 'enable' ? 'active' : actionDialog === 'ban' ? 'banned' : 'disabled';
                      handleStatusChange(selectedUser, nextStatus, statusAgencyWorkspaceId);
                    }}
                    disabled={
                      isProcessing ||
                      (actionDialog === 'enable' &&
                        isStaffAdminRole(selectedUser.role) &&
                        !hasValidDefaultAgencyMembership(selectedUser) &&
                        !statusAgencyWorkspaceId)
                    }
                    className={actionDialog === 'ban' ? 'bg-destructive text-destructive-foreground' : undefined}
                  >
                    {isProcessing ? 'Processing...' : 'Confirm'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {actionDialog === 'delete' && (
            <AlertDialog open={true} onOpenChange={closeActionDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Soft Delete User</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will soft-delete {selectedUser.full_name}. Their Auth account remains the identity source, while the profile is marked deleted for retention.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleSoftDelete(selectedUser.id)}
                    disabled={isProcessing}
                    className="bg-destructive text-destructive-foreground"
                  >
                    {isProcessing ? 'Processing...' : 'Soft Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {actionDialog === 'notes' && (
            <Dialog open={true} onOpenChange={closeActionDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Admin Notes</DialogTitle>
                  <DialogDescription>
                    Internal notes for {selectedUser.full_name} ({selectedUser.email}).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Add internal admin notes about this user..."
                      rows={6}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeActionDialog} disabled={isProcessing}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveNotes} disabled={isProcessing}>
                    {isProcessing ? 'Saving...' : 'Save Notes'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
