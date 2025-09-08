import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';

export default function Dashboard() {
  const { profile, loading: authLoading } = useAuth();

  console.log('Dashboard render - authLoading:', authLoading, 'profile:', profile);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome back, {profile?.full_name || 'User'}! Dashboard is now working.
          </p>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-600 font-semibold">✓ Dashboard component is rendering successfully!</p>
            <div className="mt-4 space-y-2">
              <p className="text-sm">
                <strong>Profile:</strong> {profile?.role || 'Loading...'}
              </p>
              <p className="text-sm">
                <strong>Auth Loading:</strong> {authLoading ? 'Yes' : 'No'}
              </p>
              <p className="text-sm">
                <strong>Full Name:</strong> {profile?.full_name || 'Loading...'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The dashboard has been simplified to debug loading issues. 
              Once confirmed working, we can restore the full dashboard functionality.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}