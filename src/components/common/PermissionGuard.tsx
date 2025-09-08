import React from 'react';
import { usePermissions } from '@/hooks/usePermissions';

interface PermissionGuardProps {
  children: React.ReactNode;
  permission: keyof ReturnType<typeof usePermissions>;
  fallback?: React.ReactNode;
}

export function PermissionGuard({ children, permission, fallback = null }: PermissionGuardProps) {
  const permissions = usePermissions();
  
  if (!permissions[permission]) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}