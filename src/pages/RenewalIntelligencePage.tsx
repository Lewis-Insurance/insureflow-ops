import { AppLayout } from '@/components/layout/AppLayout';
import RenewalIntelligenceDashboard from '@/components/renewals/RenewalIntelligenceDashboard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RenewalIntelligencePage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/renewals')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Renewals
              </Button>
            </div>
            <h1 className="text-3xl font-bold">Renewal Intelligence</h1>
            <p className="text-muted-foreground">
              AI-powered risk analysis and retention campaigns
            </p>
          </div>
        </div>

        {/* Dashboard */}
        <RenewalIntelligenceDashboard />
      </div>
    </AppLayout>
  );
}
