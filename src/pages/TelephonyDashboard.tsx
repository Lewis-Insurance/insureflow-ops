import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { TelephonyDashboard as TelephonyDashboardComponent } from '@/components/crm/TelephonyDashboard';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function TelephonyDashboard() {
  return (
    <AppLayout>
      <div className="flex-1 p-4 md:p-8">
        <ErrorBoundary level="page" resetOnPropsChange>
          <TelephonyDashboardComponent />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}