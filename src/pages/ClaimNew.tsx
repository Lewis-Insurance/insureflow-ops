import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { ArrowLeft } from 'lucide-react';

export default function ClaimNew() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const accountId = searchParams.get('accountId');

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate('/customers')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customers
          </Button>
          <h1 className="text-2xl font-semibold">Start New Claim</h1>
        </div>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>Claim Intake</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Starting claim for customer: {accountId}
              </p>
              <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
                <h3 className="text-lg font-semibold mb-2">Claim Intake Coming Soon</h3>
                <p className="text-muted-foreground mb-4">
                  This feature will allow you to start new insurance claims for customers.
                </p>
                <Button onClick={() => navigate('/customers')}>
                  Return to Customers
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}