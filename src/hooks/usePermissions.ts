import { useMemo } from 'react';
import { useAuth } from './useAuth';

export function usePermissions() {
  const { profile } = useAuth();

  const permissions = useMemo(() => {
    const role = profile?.role;
    const isStaff = profile?.is_staff || false;

    return {
      // Core permission checks
      isStaff: isStaff || role === 'staff' || role === 'admin',
      isAdmin: role === 'admin',
      
      // Specific permissions
      canEdit: isStaff || role === 'staff' || role === 'admin',
      canDelete: role === 'admin',
      canViewSensitiveData: isStaff || role === 'staff' || role === 'admin',
      canRevealSSN: isStaff || role === 'staff' || role === 'admin',
      canManageDocuments: isStaff || role === 'staff' || role === 'admin',
      canViewAuditLogs: isStaff || role === 'staff' || role === 'admin',
      canBulkActions: isStaff || role === 'staff' || role === 'admin',
      canExportData: isStaff || role === 'staff' || role === 'admin',
      
      // Read-only permissions
      canView: true, // All authenticated users can view
      role: role || 'customer'
    };
  }, [profile]);

  return permissions;
}