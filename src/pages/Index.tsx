import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import Dashboard from './Dashboard';

const Index = () => {
  const { isAuthenticated, loading, profile } = useAuth();

  console.log('Index component - isAuthenticated:', isAuthenticated, 'loading:', loading, 'profile:', profile);

  console.log('Index component - checking loading state...');

  if (loading) {
    console.log('Index component - showing loading spinner');
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  console.log('Index component - checking authentication...');
  if (!isAuthenticated) {
    console.log('Index component - not authenticated, redirecting to /auth');
    return <Navigate to="/auth" replace />;
  }

  console.log('Index component - rendering AppLayout with Dashboard');

  return (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  );
};

export default Index;
