/**
 * Enhanced User Directory Component
 * 
 * Comprehensive user management with:
 * - Status tracking (active/disabled/banned)
 * - Last seen, usage metrics
 * - Admin actions (disable/enable, force logout, notes)
 * - Search, filter, sort
 * - Soft delete with data retention
 */

import { useState, useEffect } from 'react';
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
  Filter,
  MoreVertical,
  UserX,
  UserCheck,
  LogOut,
  Trash2,
  Eye,
  Pencil,
  Ban,
  RefreshCw,
  Download,
  UserCog,
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

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: 'active' | 'disabled' | 'banned' | null;
  last_seen_at: string | null;
  created_at: string;
  admin_notes: string | null;
  deleted_at: string | null;
  usage_metrics?: {
    api_calls: number;
    tokens_used: number;
    cost_spent: number;
  };
}

type SortField = 'name' | 'email' | 'created_at' | 'last_seen_at' | 'role';
type SortDirection = 'asc' | 'desc';

export function EnhancedUserDirectory() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Action dialogs
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionDialog, setActionDialog] = useState<'disable' | 'enable' | 'ban' | 'logout' | 'delete' | 'notes' | null>(null);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, [statusFilter, roleFilter, sortField, sortDirection]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          role,
          status,
          last_seen_at,
          created_at,
          admin_notes,
          deleted_at
        `)
        .is('deleted_at', null); // Only show non-deleted users by default

      // Apply filters
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (roleFilter !== 'all') {
        query = query.eq('role', roleFilter);
      }

      // Apply search
      if (searchQuery) {
        query = query.or(`email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`);
      }

      // Apply sorting
      query = query.order(sortField, { ascending: sortDirection === 'asc' });

      const { data, error } = await query;

      if (error) throw error;

      // Fetch usage metrics for each user
      const usersWithMetrics = await Promise.all(
        (data || []).map(async (user) => {
          const { data: metrics } = await supabase
            .from('user_usage_metrics')
            .select('api_calls, tokens_used, cost_spent')
            .eq('user_id', user.id)
            .order('period_start', { ascending: false })
            .limit(1)
            .single();

          return {
            ...user,
            usage_metrics: metrics || { api_calls: 0, tokens_used: 0, cost_spent: 0 },
          };
        })
      );

      setUsers(usersWithMetrics);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: 'active' | 'disabled' | 'banned') => {
    try {
      setIsProcessing(true);
      
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', userId);

      if (error) throw error;

      // Log to audit
      await supabase.from('admin_audit_log').insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        action_type: `user_${newStatus}`,
        resource_type: 'user',
        resource_id: userId,
        action_details: { status: newStatus },
      });

      toast({
        title: 'Success',
        description: `User status updated to ${newStatus}`,
      });

      fetchUsers();
      setActionDialog(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user status',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleForceLogout = async (userId: string) => {
    try {
      setIsProcessing(true);
      
      // Revoke all sessions for this user
      const { error } = await supabase.functions.invoke('admin-revoke-sessions', {
        body: { user_id: userId },
      });

      if (error) throw error;

      // Log to audit
      await supabase.from('admin_audit_log').insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        action_type: 'user_force_logout',
        resource_type: 'user',
        resource_id: userId,
      });

      toast({
        title: 'Success',
        description: 'All user sessions have been revoked',
      });

      fetchUsers();
      setActionDialog(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to revoke sessions',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSoftDelete = async (userId: string) => {
    try {
      setIsProcessing(true);
      
      const currentUser = (await supabase.auth.getUser()).data.user;
      
      const { error } = await supabase
        .from('profiles')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: currentUser?.id,
          status: 'disabled',
        })
        .eq('id', userId);

      if (error) throw error;

      // Log to audit
      await supabase.from('admin_audit_log').insert({
        actor_id: currentUser?.id,
        action_type: 'user_deleted',
        resource_type: 'user',
        resource_id: userId,
        action_details: { soft_delete: true },
      });

      toast({
        title: 'Success',
        description: 'User has been soft-deleted',
      });

      fetchUsers();
      setActionDialog(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user',
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
      
      const { error } = await supabase
        .from('profiles')
        .update({ admin_notes: notes })
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Admin notes saved',
      });

      fetchUsers();
      setActionDialog(null);
      setNotes('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save notes',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
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
      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
          <CardDescription>
            Search, filter, and manage all users in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="analyst">Analyst</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchUsers}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* User Table */}
          {loading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Usage (30d)</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.full_name || 'No name'}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
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
                        <div>{user.usage_metrics?.api_calls || 0} calls</div>
                        <div className="text-muted-foreground">
                          {formatCurrency(user.usage_metrics?.cost_spent || 0)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
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
                          {user.status !== 'disabled' && (
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
                          {user.status === 'disabled' && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setActionDialog('enable');
                              }}
                            >
                              <UserCheck className="h-4 w-4 mr-2" />
                              Enable
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setActionDialog('logout');
                            }}
                          >
                            <LogOut className="h-4 w-4 mr-2" />
                            Force Logout
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
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setActionDialog('delete');
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Action Dialogs */}
      {selectedUser && (
        <>
          {/* Disable/Enable Dialog */}
          {(actionDialog === 'disable' || actionDialog === 'enable') && (
            <AlertDialog open={true} onOpenChange={() => setActionDialog(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {actionDialog === 'disable' ? 'Disable User' : 'Enable User'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to {actionDialog} {selectedUser.full_name} ({selectedUser.email})?
                    {actionDialog === 'disable' && ' They will not be able to log in until re-enabled.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleStatusChange(selectedUser.id, actionDialog === 'disable' ? 'disabled' : 'active')}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Confirm'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Force Logout Dialog */}
          {actionDialog === 'logout' && (
            <AlertDialog open={true} onOpenChange={() => setActionDialog(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Force Logout</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will revoke all active sessions for {selectedUser.full_name}. They will need to log in again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleForceLogout(selectedUser.id)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Revoke Sessions'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Delete Dialog */}
          {actionDialog === 'delete' && (
            <AlertDialog open={true} onOpenChange={() => setActionDialog(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will soft-delete {selectedUser.full_name}. Their data will be retained for compliance purposes.
                    This action can be reversed by an admin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleSoftDelete(selectedUser.id)}
                    disabled={isProcessing}
                    className="bg-destructive text-destructive-foreground"
                  >
                    {isProcessing ? 'Processing...' : 'Delete User'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Admin Notes Dialog */}
          {actionDialog === 'notes' && (
            <Dialog open={true} onOpenChange={() => setActionDialog(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Admin Notes</DialogTitle>
                  <DialogDescription>
                    Internal notes for {selectedUser.full_name} ({selectedUser.email})
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add internal admin notes about this user..."
                      rows={6}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setActionDialog(null)} disabled={isProcessing}>
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

