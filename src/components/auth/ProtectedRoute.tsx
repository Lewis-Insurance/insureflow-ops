/**
 * Protected Route Component
 *
 * Wraps routes that require authentication.
 * Redirects to /auth if user is not authenticated.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardSkeleton } from '@/components/ui/skeleton-components';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, only allows staff/admin users */
  requireStaff?: boolean;
  /** If true, only allows admin users */
  requireAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireStaff = false,
  requireAdmin = false
}: ProtectedRouteProps) {
  const { user, loading, isStaff, isAdmin, isAuthenticated } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated || !user) {
    // Save the attempted URL for redirecting after login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check staff requirement
  if (requireStaff && !isStaff) {
    return <Navigate to="/auth" state={{ error: 'Staff access required' }} replace />;
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/auth" state={{ error: 'Admin access required' }} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
