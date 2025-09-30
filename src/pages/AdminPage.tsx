import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Building2, Users, Shield } from 'lucide-react';
import { CompanyManagement } from '@/components/admin/CompanyManagement';
import { CarrierManagement } from '@/components/admin/CarrierManagement';
import { BusinessTypeManagement } from '@/components/admin/BusinessTypeManagement';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function AdminPage() {
  const { profile, isAdmin } = useAuth();

  // Redirect non-admin users
  if (!isAdmin && profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
            <p className="text-muted-foreground">
              Manage companies, carriers, and system configuration
            </p>
          </div>
        </div>

        <Tabs defaultValue="companies" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Companies
            </TabsTrigger>
            <TabsTrigger value="carriers" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Carriers
            </TabsTrigger>
            <TabsTrigger value="business-types" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Business Types
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              System
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Company Management
                </CardTitle>
                <CardDescription>
                  Manage companies, MGAs, brokers, and other business entities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CompanyManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="carriers" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Carrier Management
                </CardTitle>
                <CardDescription>
                  Manage insurance carriers and their information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CarrierManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="business-types" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
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