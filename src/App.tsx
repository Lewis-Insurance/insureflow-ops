import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { DashboardSkeleton } from "@/components/ui/skeleton-components";
import { ThemeProvider } from "next-themes";

// Lazy load pages for code splitting
const Index = React.lazy(() => import("./pages/Index"));
const Auth = React.lazy(() => import("./pages/Auth"));
const CRM = React.lazy(() => import("./pages/CRM"));
const AccountDetail = React.lazy(() => import("./pages/AccountDetail"));
const Leads = React.lazy(() => import("./pages/Leads"));
const LeadAnalyticsDashboard = React.lazy(() => import("./pages/LeadAnalyticsDashboard"));

const PolicyDetail = React.lazy(() => import("./pages/PolicyDetail"));
const CustomersPage = React.lazy(() => import("./pages/CustomersPage"));
const CustomerDetail = React.lazy(() => import("./pages/CustomerDetail"));
const CustomerEdit = React.lazy(() => import("./pages/CustomerEdit"));
const PoliciesPage = React.lazy(() => import("./pages/PoliciesPage"));
const RenewalsPage = React.lazy(() => import("./pages/RenewalsPage"));
const RenewalIntelligencePage = React.lazy(() => import("./pages/RenewalIntelligencePage"));
const AOImportPage = React.lazy(() => import("./pages/AOImportPage"));
const AORenewalsPage = React.lazy(() => import("./pages/AORenewalsPage"));
const AORenewalEdit = React.lazy(() => import("./pages/AORenewalEdit"));
const AOAnalyticsDashboard = React.lazy(() => import("./pages/AOAnalyticsDashboard"));
const RateWatchList = React.lazy(() => import("./pages/ao-renewals/RateWatchList"));
const NewRateWatch = React.lazy(() => import("./pages/ao-renewals/NewRateWatch"));
const RateWatchDetail = React.lazy(() => import("./pages/ao-renewals/RateWatchDetail"));
const QuoteNew = React.lazy(() => import("./pages/QuoteNew"));
const QuoteDetail = React.lazy(() => import("./pages/QuoteDetail"));
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
const MGAsPage = React.lazy(() => import("./pages/MGAsPage"));
const CustomerSuccessPage = React.lazy(() => import("./pages/CustomerSuccessPage"));
const RetentionPage = React.lazy(() => import("./pages/RetentionPage"));
const FinancialPage = React.lazy(() => import("./pages/FinancialPage"));
const AIInsightsPage = React.lazy(() => import("./pages/AIInsightsPage"));
const COIGenerator = React.lazy(() => import("./pages/COIGenerator"));
const AcordTemplates = React.lazy(() => import("./pages/AcordTemplates"));
const IntakeTemplates = React.lazy(() => import("./pages/IntakeTemplates"));
const IntakeBuilder = React.lazy(() => import("./pages/IntakeBuilder"));
const PublicIntake = React.lazy(() => import("./pages/PublicIntake"));
const TemplateManagement = React.lazy(() => import("./pages/TemplateManagement"));
const FormManagement = React.lazy(() => import("./pages/FormManagement"));
const AcordFormView = React.lazy(() => import("./pages/AcordFormView"));
const AcordFormEdit = React.lazy(() => import("./pages/AcordFormEdit"));
const DocumentIntelligence = React.lazy(() => import("./pages/DocumentIntelligence"));
const DocumentAnalysisPage = React.lazy(() => import("./pages/AnalyzeDocumentsPage"));
const AIBrain = React.lazy(() => import("./pages/AIBrain"));
const KnowledgeManagerPage = React.lazy(() => import("./pages/KnowledgeManagerPage"));
const KnowledgeAnalytics = React.lazy(() => import("./pages/KnowledgeAnalytics"));
const InsuranceComparison = React.lazy(() => import("./pages/InsuranceComparison"));
const WorkspaceDetailPage = React.lazy(() => import("./pages/WorkspaceDetailPage"));
const WorkspaceListViewPage = React.lazy(() => import("./pages/WorkspaceListViewPage"));
const ComparisonReportPage = React.lazy(() => import("./pages/ComparisonReportPage"));
const ComparisonPage = React.lazy(() => import("./pages/ComparisonPage"));
const ProducerDashboard = React.lazy(() => import("./pages/ProducerDashboard"));
const AgencyDashboard = React.lazy(() => import("./pages/AgencyDashboard"));
const SchemaCheckPage = React.lazy(() => import("./pages/SchemaCheckPage"));
const CustomizationPage = React.lazy(() => import("./pages/CustomizationPage"));
const CampaignsPage = React.lazy(() => import("./pages/CampaignsPage"));
const CampaignBuilderPage = React.lazy(() => import("./pages/CampaignBuilderPage"));
const ExplorePolicy = React.lazy(() => import("./pages/ExplorePolicy"));
const LewiAI = React.lazy(() => import("./pages/LewiAI"));
const CoverageGapAnalysis = React.lazy(() => import("./pages/CoverageGapAnalysis"));
const CoverageGapDetail = React.lazy(() => import("./pages/CoverageGapDetail"));
const IssueTracker = React.lazy(() => import("./pages/IssueTracker"));
const ReportIssue = React.lazy(() => import("./pages/ReportIssue"));
const IssueDetail = React.lazy(() => import("./pages/IssueDetail"));
const PredictiveAnalytics = React.lazy(() => import("./pages/PredictiveAnalytics"));
const PortalLoginPage = React.lazy(() => import("./pages/PortalLoginPage"));
const PortalDashboard = React.lazy(() => import("./pages/PortalDashboard"));
const MarketingAutomationsPage = React.lazy(() => import("./pages/MarketingAutomationsPage"));
const AutomationBuilderPage = React.lazy(() => import("./pages/AutomationBuilderPage"));
const MarketingTemplatesPage = React.lazy(() => import("./pages/MarketingTemplatesPage"));
const CarrierTemplatesPage = React.lazy(() => import("./pages/CarrierTemplatesPage"));
const CarrierTemplateBuilder = React.lazy(() => import("./pages/CarrierTemplateBuilder"));
const ExtractionReviewQueue = React.lazy(() => import("./pages/ExtractionReviewQueue"));
const ExtractionReviewDetail = React.lazy(() => import("./pages/ExtractionReviewDetail"));
const ExtractionAnalyticsPage = React.lazy(() => import("./pages/ExtractionAnalyticsPage"));
const PrismAIPage = React.lazy(() => import("./pages/PrismAIPage"));
const SMSPage = React.lazy(() => import("./pages/SMSPage"));
const DocumentCollectionPortal = React.lazy(() => import("./pages/DocumentCollectionPortal"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data fresh for 5 min
      gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for 10 min
      retry: (failureCount, error) => {
        // Don't retry on 404s or auth errors
        if (error instanceof Error && (error.message.includes('404') || error.message.includes('auth'))) {
          return false;
        }
        return failureCount < 2; // Reduce retries from 3 to 2
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      refetchOnWindowFocus: false, // Don't refetch on window focus to reduce API calls
      refetchOnMount: true, // Refetch on component mount if data is stale
      refetchOnReconnect: true, // Refetch when connection restored
    },
    mutations: {
      retry: 1, // Reduce mutation retries
    },
  },
});

const App = () => (
  <ErrorBoundary level="app" resetOnPropsChange>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
                path="/dashboard"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ProducerDashboard />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/dashboard/agency"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AgencyDashboard />
                  </ErrorBoundary>
                }
              />
              <Route 
                path="/leads" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <Leads />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/leads/analytics" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <LeadAnalyticsDashboard />
                  </ErrorBoundary>
                } 
              />
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
                path="/renewals/intelligence" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <RenewalIntelligencePage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/ao-renewals" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AORenewalsPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/ao-renewals/import" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AOImportPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/ao-renewals/:id/edit" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AORenewalEdit />
                  </ErrorBoundary>
                } 
              />
<Route 
                path="/ao-renewals/analytics" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AOAnalyticsDashboard />
                  </ErrorBoundary>
                }
              />
              <Route 
                path="/ao-renewals/rate-watch" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <RateWatchList />
                  </ErrorBoundary>
                }
              />
              <Route 
                path="/ao-renewals/rate-watch/new" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <NewRateWatch />
                  </ErrorBoundary>
                }
              />
              <Route 
                path="/ao-renewals/rate-watch/:jobId" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <RateWatchDetail />
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
                path="/quotes/:quoteId"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <QuoteDetail />
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
                path="/customization" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CustomizationPage />
                  </ErrorBoundary>
                } 
              />
              <Route 
                path="/schema-check" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <SchemaCheckPage />
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
                path="/sms" 
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <SMSPage />
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
                path="/mgas"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <MGAsPage />
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
                path="/coi-generator"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <COIGenerator />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/acord-templates"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AcordTemplates />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/intake-templates"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <IntakeTemplates />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/intake-builder/:id?"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <IntakeBuilder />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/intake/:token?"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PublicIntake />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/portal/collect/:token"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <DocumentCollectionPortal />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/acord-forms"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <FormManagement />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/acord-forms/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AcordFormView />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/acord-forms/:id/edit"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AcordFormEdit />
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
                path="/analyze-documents"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <DocumentAnalysisPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/analyze-documents/:analysisId"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <DocumentAnalysisPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/comparison"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ComparisonPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/comparison/:sessionId"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ComparisonPage />
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
                path="/prism-ai"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PrismAIPage />
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
              <Route
                path="/knowledge-analytics"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <KnowledgeAnalytics />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/workspace"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <WorkspaceListViewPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/workspace/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <WorkspaceDetailPage />
                  </ErrorBoundary>
                }
              />
              <Route 
                path="/comparison-report/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ComparisonReportPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/campaigns"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CampaignsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/campaigns/new"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CampaignBuilderPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/campaigns/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CampaignBuilderPage />
                  </ErrorBoundary>
                }
              />
              {/* Marketing Automations (Levitate) */}
              <Route
                path="/marketing/automations"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <MarketingAutomationsPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/marketing/automations/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <AutomationBuilderPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/marketing/templates"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <MarketingTemplatesPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/lewi-ai"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <LewiAI />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/coverage-gap-analysis"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CoverageGapAnalysis />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/coverage-gap-analysis/:accountId"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CoverageGapAnalysis />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/coverage-gap/:analysisId"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CoverageGapDetail />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/issues"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <IssueTracker />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/issues/new"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ReportIssue />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/issues/:issueId"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <IssueDetail />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/predictive-analytics"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PredictiveAnalytics />
                  </ErrorBoundary>
                }
              />
              {/* Redirect old /operations route to Command Center */}
              <Route path="/operations" element={<CommandCenterPage />} />
              {/* Client Portal Routes (Public) */}
              <Route
                path="/portal/login"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PortalLoginPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/portal/dashboard"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PortalDashboard />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/portal"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <PortalDashboard />
                  </ErrorBoundary>
                }
              />
              {/* Carrier Templates & Extraction Review */}
              <Route
                path="/carrier-templates"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CarrierTemplatesPage />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/carrier-templates/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CarrierTemplateBuilder />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/carrier-templates/:id/edit"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <CarrierTemplateBuilder />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/extraction-review"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ExtractionReviewQueue />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/extraction-review/:id"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ExtractionReviewDetail />
                  </ErrorBoundary>
                }
              />
              <Route
                path="/extraction-analytics"
                element={
                  <ErrorBoundary level="page" resetOnPropsChange>
                    <ExtractionAnalyticsPage />
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
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
