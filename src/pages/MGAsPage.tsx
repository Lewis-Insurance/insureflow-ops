import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MGAManagementTab } from '@/components/admin/MGAManagementTab';
import { Briefcase } from 'lucide-react';

export default function MGAsPage() {
  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Managing General Agents (MGAs)</h1>
            <p className="text-muted-foreground">
              Manage your MGAs and their contact information
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              MGA Management
            </CardTitle>
            <CardDescription>
              View and manage Managing General Agents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MGAManagementTab />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
