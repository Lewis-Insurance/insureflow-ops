import React from 'react';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void; navigate: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  level?: 'app' | 'page' | 'component';
}

interface ErrorFallbackProps {
  error: Error;
  retry: () => void;
  navigate: () => void;
  level?: 'app' | 'page' | 'component';
}

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({ 
  error, 
  retry, 
  navigate, 
  level = 'component' 
}) => {
  const getErrorTitle = () => {
    switch (level) {
      case 'app': return 'Application Error';
      case 'page': return 'Page Error';
      default: return 'Component Error';
    }
  };

  const getErrorDescription = () => {
    switch (level) {
      case 'app': 
        return 'The application encountered an unexpected error. Please try refreshing the page.';
      case 'page': 
        return 'This page encountered an error while loading. You can try again or navigate elsewhere.';
      default: 
        return 'This component failed to load properly. You can retry or continue using other parts of the application.';
    }
  };

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <CardTitle className="text-lg">{getErrorTitle()}</CardTitle>
        <CardDescription>
          {getErrorDescription()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {import.meta.env.DEV && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
              Error Details (Development)
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
        
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={retry} variant="default" size="sm" className="flex-1">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          
          {level !== 'app' && (
            <Button onClick={navigate} variant="outline" size="sm" className="flex-1">
              {level === 'page' ? (
                <>
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </>
              ) : (
                <>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go Back
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error for monitoring
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
    
    // Auto-retry after 5 seconds for component-level errors
    if (this.props.level === 'component') {
      this.resetTimeoutId = window.setTimeout(() => {
        this.resetErrorBoundary();
      }, 5000);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    // Reset error boundary when props change (if enabled)
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback: Fallback, level = 'component' } = this.props;

    if (hasError && error) {
      const navigate = () => {
        if (level === 'page') {
          window.location.href = '/';
        } else {
          window.history.back();
        }
      };

      if (Fallback) {
        return <Fallback error={error} retry={this.resetErrorBoundary} navigate={navigate} />;
      }

      return (
        <DefaultErrorFallback 
          error={error} 
          retry={this.resetErrorBoundary} 
          navigate={navigate}
          level={level}
        />
      );
    }

    return children;
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}

// Hook for throwing errors to boundary
export const useErrorHandler = () => {
  return React.useCallback((error: Error) => {
    throw error;
  }, []);
};