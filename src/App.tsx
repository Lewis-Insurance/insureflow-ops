import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { DashboardSkeleton } from "@/components/ui/skeleton-components";

// Lazy load pages for code splitting
const Index = React.lazy(() => import("./pages/Index"));
const Auth = React.lazy(() => import("./pages/Auth"));
const CRM = React.lazy(() => import("./pages/CRM"));
const AccountDetail = React.lazy(() => import("./pages/AccountDetail"));
const Profile = React.lazy(() => import("./pages/Profile"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 404s or auth errors
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('auth'))) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});

const App = () => (
  <ErrorBoundary level="app" resetOnPropsChange>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Suspense fallback={<DashboardSkeleton />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route 
                path="/crm" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CRM />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/crm/accounts/:accountId" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AccountDetail />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/profile" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <Profile />
                  </ErrorBoundary>
                } 
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
