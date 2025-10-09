import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Building2, Users, Shield } from 'lucide-react';
// Temporarily comment out potentially problematic imports
// import { CompanyManagement } from '@/components/admin/CompanyManagement';
// import { CarrierManagement } from '@/components/admin/CarrierManagement';
import { CarrierManagementTab } from '@/components/admin/CarrierManagementTab';
import { MGAManagementTab } from '@/components/admin/MGAManagementTab';
import { BusinessTypeManagement } from '@/components/admin/BusinessTypeManagement';
import { TaskTemplateManager } from '@/components/tasks/TaskTemplateManager';
import { UserManagement } from '@/components/admin/UserManagement';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function AdminPage() {
  const { profile, isAdmin, loading } = useAuth();

  // Show loading while auth is being determined
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Debug: Log the profile role for troubleshooting
  console.log('AdminPage - Profile:', profile, 'isAdmin:', isAdmin);

  // Redirect non-admin users
  if (!isAdmin && profile?.role !== 'admin') {
    return <Navigate to="/crm" replace />;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
            <p className="text-muted-foreground">
              Manage carriers, MGAs, business types, and system configuration
            </p>
          </div>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="carriers" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Carriers
            </TabsTrigger>
            <TabsTrigger value="mgas" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              MGAs
            </TabsTrigger>
            <TabsTrigger value="business-types" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Business Types
            </TabsTrigger>
            <TabsTrigger value="task-templates" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Task Templates
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              System
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <UserManagement />
          </TabsContent>

          <TabsContent value="carriers" className="space-y-6">
            <CarrierManagementTab />
          </TabsContent>

          <TabsContent value="mgas" className="space-y-6">
            <MGAManagementTab />
          </TabsContent>

          <TabsContent value="business-types" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Business Type Management
                </CardTitle>
                <CardDescription>
                  Configure business types and categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessTypeManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="task-templates" className="space-y-6">
            <TaskTemplateManager />
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>System Configuration</CardTitle>
                <CardDescription>
                  System-wide settings and configuration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  System configuration features coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}