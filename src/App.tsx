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

const PolicyDetail = React.lazy(() => import("./pages/PolicyDetail"));
const CustomersPage = React.lazy(() => import("./pages/CustomersPage"));
const CustomerDetail = React.lazy(() => import("./pages/CustomerDetail"));
const CustomerEdit = React.lazy(() => import("./pages/CustomerEdit"));
const PoliciesPage = React.lazy(() => import("./pages/PoliciesPage"));
const RenewalsPage = React.lazy(() => import("./pages/RenewalsPage"));
const QuoteNew = React.lazy(() => import("./pages/QuoteNew"));
const ClaimNew = React.lazy(() => import("./pages/ClaimNew"));
const MessageNew = React.lazy(() => import("./pages/MessageNew"));
const Profile = React.lazy(() => import("./pages/Profile"));
const TasksPage = React.lazy(() => import("./pages/TasksPage"));
const TaskTemplatesPage = React.lazy(() => import("./pages/TaskTemplatesPage"));
const AdminPage = React.lazy(() => import("./pages/AdminPage"));
const TelephonyDashboard = React.lazy(() => import("./pages/TelephonyDashboard"));
const ReportsPage = React.lazy(() => import("./pages/ReportsPage"));
const CommandCenterPage = React.lazy(() => import("./pages/CommandCenterPage"));
const ExecutivePage = React.lazy(() => import("./pages/ExecutivePage"));
const AnalyticsPage = React.lazy(() => import("./pages/AnalyticsPage"));
const CarriersPage = React.lazy(() => import("./pages/CarriersPage"));
const CustomerSuccessPage = React.lazy(() => import("./pages/CustomerSuccessPage"));
const RetentionPage = React.lazy(() => import("./pages/RetentionPage"));
const FinancialPage = React.lazy(() => import("./pages/FinancialPage"));
const AIInsightsPage = React.lazy(() => import("./pages/AIInsightsPage"));
const TicketsPage = React.lazy(() => import("./pages/TicketsPage"));
const TicketDetail = React.lazy(() => import("./pages/TicketDetail"));
const COIGenerator = React.lazy(() => import("./pages/COIGenerator"));
const DocumentIntelligence = React.lazy(() => import("./pages/DocumentIntelligence"));
const AIBrain = React.lazy(() => import("./pages/AIBrain"));
const KnowledgeManagerPage = React.lazy(() => import("./pages/KnowledgeManagerPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on 404s or auth errors
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('auth'))) {
          return false;
        }
        return failureCount < 2; // Reduce retries from 3 to 2
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    },
    mutations: {
      retry: 1, // Reduce mutation retries
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
                path="/customers" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CustomersPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/customers/:id" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CustomerDetail />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/customers/:id/edit" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CustomerEdit />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/policies" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PoliciesPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/renewals" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <RenewalsPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/policies/:policyId" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PolicyDetail />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/quotes/new" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <QuoteNew />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/claims/new" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ClaimNew />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/messages/new" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <MessageNew />
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
              <Route 
                path="/tasks" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <TasksPage />
                  </ErrorBoundary>
                } 
              />
              <Route
                path="/task-templates" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <TaskTemplatesPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AdminPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/calls" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <TelephonyDashboard />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/reports" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ReportsPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/command-center" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CommandCenterPage />
                  </ErrorBoundary>
                } 
              />
              <Route
                path="/executive"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ExecutivePage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AnalyticsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/carriers"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CarriersPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/customer-success"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CustomerSuccessPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/retention"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <RetentionPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/financial"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <FinancialPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/ai-insights"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AIInsightsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/tickets"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <TicketsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/tickets/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <TicketDetail />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/tickets/:ticketId/coi"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <COIGenerator />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/document-intelligence"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <DocumentIntelligence />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/ai-brain"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AIBrain />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/knowledge-manager"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <KnowledgeManagerPage />
                  </ErrorBoundary>
                }
              />
              {/* Redirect old /operations route to Command Center */}
              <Route path="/operations" element={<CommandCenterPage />} />
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
