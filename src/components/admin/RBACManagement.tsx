/**
 * RBAC (Role-Based Access Control) Management Component
 * 
 * Manages roles and permissions:
 * - View/edit permission matrix
 * - Assign roles to users
 * - Multi-admin management
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Shield, UserPlus, Check, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface Permission {
  id: string;
  role: string;
  permission_key: string;
  granted: boolean;
}

interface RolePermission {
  role: string;
  permissions: Record<string, boolean>;
}

const PERMISSIONS = [
  { key: 'view_analytics', label: 'View Analytics' },
  { key: 'manage_users', label: 'Manage Users' },
  { key: 'billing', label: 'Billing & Costs' },
  { key: 'feature_flags', label: 'Feature Flags' },
  { key: 'audit_logs', label: 'View Audit Logs' },
  { key: 'system_settings', label: 'System Settings' },
  { key: 'impersonate', label: 'Impersonate Users' },
  { key: 'export_data', label: 'Export Data' },
];

const ROLES = ['owner', 'admin', 'analyst', 'support', 'staff', 'customer'];

export function RBACManagement() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('*')
        .order('role', { ascending: true })
        .order('permission_key', { ascending: true });

      if (error) throw error;

      setPermissions(data || []);
    } catch (error: any) {
      console.error('Error fetching permissions:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch permissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getPermissionsForRole = (role: string): Record<string, boolean> => {
    const rolePerms: Record<string, boolean> = {};
    PERMISSIONS.forEach((perm) => {
      const found = permissions.find(
        (p) => p.role === role && p.permission_key === perm.key
      );
      rolePerms[perm.key] = found?.granted || false;
    });
    return rolePerms;
  };

  const handleOpenEdit = (role: string) => {
    setSelectedRole(role);
    setRolePermissions(getPermissionsForRole(role));
    setEditDialogOpen(true);
  };

  const handleTogglePermission = (permissionKey: string) => {
    setRolePermissions((prev) => ({
      ...prev,
      [permissionKey]: !prev[permissionKey],
    }));
  };

  const handleSavePermissions = async () => {
    try {
      const updates = PERMISSIONS.map((perm) => ({
        role: selectedRole,
        permission_key: perm.key,
        granted: rolePermissions[perm.key] || false,
      }));

      // Upsert all permissions for this role
      for (const update of updates) {
        const { error } = await supabase
          .from('admin_permissions')
          .upsert(update, { onConflict: 'role,permission_key' });

        if (error) throw error;
      }

      // Log to audit
      await supabase.from('admin_audit_log').insert({
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        action_type: 'permissions_updated',
        resource_type: 'role',
        action_details: { role: selectedRole, permissions: rolePermissions },
      });

      toast({
        title: 'Success',
        description: `Permissions updated for ${selectedRole}`,
      });

      fetchPermissions();
      setEditDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update permissions',
        variant: 'destructive',
      });
    }
  };

  const getPermissionMatrix = () => {
    const matrix: RolePermission[] = ROLES.map((role) => ({
      role,
      permissions: getPermissionsForRole(role),
    }));
    return matrix;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role-Based Access Control
          </CardTitle>
          <CardDescription>
            Manage permissions for each role. Click a role to edit its permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading permissions...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    {PERMISSIONS.map((perm) => (
                      <TableHead key={perm.key} className="text-center min-w-[120px]">
                        {perm.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getPermissionMatrix().map((rolePerm) => (
                    <TableRow key={rolePerm.role}>
                      <TableCell className="font-medium capitalize">
                        {rolePerm.role}
                      </TableCell>
                      {PERMISSIONS.map((perm) => (
                        <TableCell key={perm.key} className="text-center">
                          {rolePerm.permissions[perm.key] ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <X className="h-5 w-5 text-muted-foreground mx-auto" />
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(rolePerm.role)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Permissions Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Permissions: {selectedRole}</DialogTitle>
            <DialogDescription>
              Toggle permissions for the {selectedRole} role
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {PERMISSIONS.map((perm) => (
              <div key={perm.key} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <Label htmlFor={perm.key} className="font-medium">
                    {perm.label}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {perm.key}
                  </p>
                </div>
                <Switch
                  id={perm.key}
                  checked={rolePermissions[perm.key] || false}
                  onCheckedChange={() => handleTogglePermission(perm.key)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePermissions}>Save Permissions</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

