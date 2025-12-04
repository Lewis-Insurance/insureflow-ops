import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  error: Error | string;
  retry?: () => void;
  variant?: 'inline' | 'fullscreen' | 'alert';
  title?: string;
  className?: string;
  showHomeButton?: boolean;
}

export function ErrorState({
  error,
  retry,
  variant = 'inline',
  title = "Something went wrong",
  className,
  showHomeButton = false,
}: ErrorStateProps) {
  const errorMessage = typeof error === 'string' ? error : error.message;

  if (variant === 'alert') {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">
          {errorMessage}
          {retry && (
            <Button
              onClick={retry}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const containerClasses = cn(
    "flex flex-col items-center justify-center text-center",
    variant === 'fullscreen' ? "min-h-screen p-8" : "p-6 my-8",
    className
  );

  return (
    <div className={containerClasses}>
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">{errorMessage}</p>
      <div className="flex gap-2">
        {retry && (
          <Button onClick={retry} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
        {showHomeButton && (
          <Button onClick={() => window.location.href = '/'} variant="outline">
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        )}
      </div>
    </div>
  );
}

// Specialized error states for common scenarios
export function NotFoundError({ message = "The page you're looking for doesn't exist" }: { message?: string }) {
  return (
    <ErrorState
      error={message}
      title="Not Found"
      variant="fullscreen"
      showHomeButton
    />
  );
}

export function UnauthorizedError({ retry }: { retry?: () => void }) {
  return (
    <ErrorState
      error="You don't have permission to access this resource"
      title="Unauthorized"
      variant="fullscreen"
      retry={retry}
      showHomeButton
    />
  );
}

export function NetworkError({ retry }: { retry?: () => void }) {
  return (
    <ErrorState
      error="Unable to connect to the server. Please check your internet connection and try again."
      title="Connection Error"
      variant="fullscreen"
      retry={retry}
    />
  );
}
