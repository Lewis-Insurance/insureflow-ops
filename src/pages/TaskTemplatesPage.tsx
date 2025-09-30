import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TaskTemplateManager } from '@/components/tasks/TaskTemplateManager';
import { PermissionGuard } from '@/components/common/PermissionGuard';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function TaskTemplatesPage() {
  return (
    <AppLayout>
      <div className="p-6">
        <PermissionGuard
          permission="isAdmin"
          fallback={
            <Card>
              <CardContent className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
                <p className="text-muted-foreground">
                  You need administrator privileges to manage task templates.
                </p>
              </CardContent>
            </Card>
          }
        >
          <TaskTemplateManager />
        </PermissionGuard>
      </div>
    </AppLayout>
  );
}
