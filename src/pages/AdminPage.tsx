import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Building2, Users, Shield, FileText } from 'lucide-react';
// Temporarily comment out potentially problematic imports
// import { CompanyManagement } from '@/components/admin/CompanyManagement';
// import { CarrierManagement } from '@/components/admin/CarrierManagement';
import { CarrierManagementTab } from '@/components/admin/CarrierManagementTab';
import { MGAManagementTab } from '@/components/admin/MGAManagementTab';
import { BusinessTypeManagement } from '@/components/admin/BusinessTypeManagement';
import { LinesOfBusinessManagement } from '@/components/admin/LinesOfBusinessManagement';
import { TaskTemplateManager } from '@/components/tasks/TaskTemplateManager';
import { UserManagement } from '@/components/admin/UserManagement';
import { EnhancedUserDirectory } from '@/components/admin/EnhancedUserDirectory';
import { RBACManagement } from '@/components/admin/RBACManagement';
import { LeadScoringAdmin } from '@/components/leads/LeadScoringAdmin';
import { DuplicateDetection } from '@/components/crm/DuplicateDetection';
import { AdvancedImportSystem } from '@/components/crm/AdvancedImportSystem';
import { SecurityStatus } from '@/components/crm/SecurityStatus';
import { EnhancedAuditViewer } from '@/components/crm/EnhancedAuditViewer';
import { SystemConfiguration } from '@/components/admin/SystemConfiguration';
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

        <Tabs defaultValue="users-enhanced" className="space-y-6">
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users (Basic)
            </TabsTrigger>
            <TabsTrigger value="users-enhanced" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users (Enhanced)
            </TabsTrigger>
            <TabsTrigger value="rbac" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              RBAC
            </TabsTrigger>
            <TabsTrigger value="contacts" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Contacts
            </TabsTrigger>
            <TabsTrigger value="policy-types" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Policy Types
            </TabsTrigger>
            <TabsTrigger value="business-types" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Business Types
            </TabsTrigger>
            <TabsTrigger value="data-management" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Data Management
            </TabsTrigger>
            <TabsTrigger value="task-templates" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Task Templates
            </TabsTrigger>
            <TabsTrigger value="lead-scoring" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Lead Scoring
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              System
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <UserManagement />
          </TabsContent>

          <TabsContent value="users-enhanced" className="space-y-6">
            <EnhancedUserDirectory />
          </TabsContent>

          <TabsContent value="rbac" className="space-y-6">
            <RBACManagement />
          </TabsContent>

          <TabsContent value="contacts" className="space-y-6">
            <Tabs defaultValue="mgas" className="space-y-4">
              <TabsList>
                <TabsTrigger value="mgas">MGAs</TabsTrigger>
                <TabsTrigger value="carriers">Carriers</TabsTrigger>
              </TabsList>
              <TabsContent value="mgas">
                <MGAManagementTab />
              </TabsContent>
              <TabsContent value="carriers">
                <CarrierManagementTab />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="policy-types" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Lines of Business
                </CardTitle>
                <CardDescription>
                  Configure policy types like Auto, Home, Commercial, Workers' Comp, etc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LinesOfBusinessManagement />
              </CardContent>
            </Card>
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

          <TabsContent value="data-management" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Duplicate Detection</CardTitle>
                <CardDescription>
                  Find and manage duplicate customer records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DuplicateDetection onMergeComplete={() => {}} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CSV Data Import</CardTitle>
                <CardDescription>
                  Import customer data from CSV files with advanced mapping
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AdvancedImportSystem onImportComplete={() => {}} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Model Status</CardTitle>
                <CardDescription>
                  View system security configuration and RLS policies
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SecurityStatus />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enhanced Audit Trail</CardTitle>
                <CardDescription>
                  View detailed audit logs of all system activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EnhancedAuditViewer />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="task-templates" className="space-y-6">
            <TaskTemplateManager />
          </TabsContent>

          <TabsContent value="lead-scoring" className="space-y-6">
            <LeadScoringAdmin />
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <SystemConfiguration />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}