import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { DashboardSkeleton } from "@/components/ui/skeleton-components";
import { ThemeProvider } from "next-themes";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { NavigationGuardProvider } from "@/contexts/NavigationGuardContext";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Lazy load pages for code splitting (lazyWithRetry auto-reloads once on a
// stale-chunk failure after a deploy instead of dead-ending on "Page Error").
const Index = lazyWithRetry(() => import("./pages/Index"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const CRM = lazyWithRetry(() => import("./pages/CRM"));
const AccountDetail = lazyWithRetry(() => import("./pages/AccountDetail"));
const Leads = lazyWithRetry(() => import("./pages/Leads"));
const LeadDetail = lazyWithRetry(() => import("./pages/LeadDetail"));
const LeadAnalyticsDashboard = lazyWithRetry(() => import("./pages/LeadAnalyticsDashboard"));

const PolicyDetail = lazyWithRetry(() => import("./pages/PolicyDetail"));
const CustomersPage = lazyWithRetry(() => import("./pages/CustomersPage"));
const CustomerDetail = lazyWithRetry(() => import("./pages/CustomerDetail"));
const CustomerEdit = lazyWithRetry(() => import("./pages/CustomerEdit"));
const PoliciesPage = lazyWithRetry(() => import("./pages/PoliciesPage"));
const RenewalsPage = lazyWithRetry(() => import("./pages/RenewalsPage"));
const RenewalIntelligencePage = lazyWithRetry(() => import("./pages/RenewalIntelligencePage"));
const RenewalEditPage = lazyWithRetry(() => import("./pages/RenewalEditPage"));
const AOImportPage = lazyWithRetry(() => import("./pages/AOImportPage"));
const AORenewalsPage = lazyWithRetry(() => import("./pages/AORenewalsPage"));
const AORenewalEdit = lazyWithRetry(() => import("./pages/AORenewalEdit"));
const AOAnalyticsDashboard = lazyWithRetry(() => import("./pages/AOAnalyticsDashboard"));
const RenewalRateWatchPage = lazyWithRetry(() => import("./pages/RenewalRateWatchPage"));
const QuoteNew = lazyWithRetry(() => import("./pages/QuoteNew"));
const QuoteDetail = lazyWithRetry(() => import("./pages/QuoteDetail"));
const ClaimNew = lazyWithRetry(() => import("./pages/ClaimNew"));
const MessageNew = lazyWithRetry(() => import("./pages/MessageNew"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const TasksPage = lazyWithRetry(() => import("./pages/TasksPage"));
const TaskTemplatesPage = lazyWithRetry(() => import("./pages/TaskTemplatesPage"));
const AdminPage = lazyWithRetry(() => import("./pages/AdminPage"));
const TelephonyDashboard = lazyWithRetry(() => import("./pages/TelephonyDashboard"));
const ReportsPage = lazyWithRetry(() => import("./pages/ReportsPage"));
const CommandCenterPage = lazyWithRetry(() => import("./pages/CommandCenterPage"));
const MergeCustomersPage = lazyWithRetry(() => import("./pages/MergeCustomersPage"));
const DuplicatesReviewPage = lazyWithRetry(() => import("./pages/DuplicatesReviewPage"));
const TeamMessagingPage = lazyWithRetry(() => import("./pages/TeamMessagingPage"));
const ExecutivePage = lazyWithRetry(() => import("./pages/ExecutivePage"));
const AnalyticsPage = lazyWithRetry(() => import("./pages/AnalyticsPage"));
const CarriersPage = lazyWithRetry(() => import("./pages/CarriersPage"));
const MGAsPage = lazyWithRetry(() => import("./pages/MGAsPage"));
const CustomerSuccessPage = lazyWithRetry(() => import("./pages/CustomerSuccessPage"));
const RetentionPage = lazyWithRetry(() => import("./pages/RetentionPage"));
const FinancialPage = lazyWithRetry(() => import("./pages/FinancialPage"));
const AIInsightsPage = lazyWithRetry(() => import("./pages/AIInsightsPage"));
const COIGenerator = lazyWithRetry(() => import("./pages/COIGenerator"));
const AcordTemplates = lazyWithRetry(() => import("./pages/AcordTemplates"));
const IntakeTemplates = lazyWithRetry(() => import("./pages/IntakeTemplates"));
const IntakeBuilder = lazyWithRetry(() => import("./pages/IntakeBuilder"));
const PublicIntake = lazyWithRetry(() => import("./pages/PublicIntake"));
const TemplateManagement = lazyWithRetry(() => import("./pages/TemplateManagement"));
const FormManagement = lazyWithRetry(() => import("./pages/FormManagement"));
const AcordFormView = lazyWithRetry(() => import("./pages/AcordFormView"));
const AcordFormEdit = lazyWithRetry(() => import("./pages/AcordFormEdit"));
const DocumentIntelligence = lazyWithRetry(() => import("./pages/DocumentIntelligence"));
const DocumentAnalysisPage = lazyWithRetry(() => import("./pages/AnalyzeDocumentsPage"));
const AIBrain = lazyWithRetry(() => import("./pages/AIBrain"));
const KnowledgeManagerPage = lazyWithRetry(() => import("./pages/KnowledgeManagerPage"));
const KnowledgeAnalytics = lazyWithRetry(() => import("./pages/KnowledgeAnalytics"));
const InsuranceComparison = lazyWithRetry(() => import("./pages/InsuranceComparison"));
const WorkspaceDetailPage = lazyWithRetry(() => import("./pages/WorkspaceDetailPage"));
const WorkspaceListViewPage = lazyWithRetry(() => import("./pages/WorkspaceListViewPage"));
const ComparisonReportPage = lazyWithRetry(() => import("./pages/ComparisonReportPage"));
const ComparisonPage = lazyWithRetry(() => import("./pages/ComparisonPage"));
const ProducerDashboard = lazyWithRetry(() => import("./pages/ProducerDashboard"));
const AgencyDashboard = lazyWithRetry(() => import("./pages/AgencyDashboard"));
const SchemaCheckPage = lazyWithRetry(() => import("./pages/SchemaCheckPage"));
const CustomizationPage = lazyWithRetry(() => import("./pages/CustomizationPage"));
const CampaignsPage = lazyWithRetry(() => import("./pages/CampaignsPage"));
const CampaignBuilderPage = lazyWithRetry(() => import("./pages/CampaignBuilderPage"));
const ExplorePolicy = lazyWithRetry(() => import("./pages/ExplorePolicy"));
const LewiAI = lazyWithRetry(() => import("./pages/LewiAI"));
const CoverageGapAnalysis = lazyWithRetry(() => import("./pages/CoverageGapAnalysis"));
const CoverageGapDetail = lazyWithRetry(() => import("./pages/CoverageGapDetail"));
const IssueTracker = lazyWithRetry(() => import("./pages/IssueTracker"));
const ReportIssue = lazyWithRetry(() => import("./pages/ReportIssue"));
const IssueDetail = lazyWithRetry(() => import("./pages/IssueDetail"));
const PredictiveAnalytics = lazyWithRetry(() => import("./pages/PredictiveAnalytics"));
const PortalLoginPage = lazyWithRetry(() => import("./pages/PortalLoginPage"));
const PortalDashboard = lazyWithRetry(() => import("./pages/PortalDashboard"));
const MarketingAutomationsPage = lazyWithRetry(() => import("./pages/MarketingAutomationsPage"));
const AutomationBuilderPage = lazyWithRetry(() => import("./pages/AutomationBuilderPage"));
const MarketingTemplatesPage = lazyWithRetry(() => import("./pages/MarketingTemplatesPage"));
const CarrierTemplatesPage = lazyWithRetry(() => import("./pages/CarrierTemplatesPage"));
const CarrierTemplateBuilder = lazyWithRetry(() => import("./pages/CarrierTemplateBuilder"));
const ExtractionReviewQueue = lazyWithRetry(() => import("./pages/ExtractionReviewQueue"));
const ExtractionReviewDetail = lazyWithRetry(() => import("./pages/ExtractionReviewDetail"));
const ExtractionAnalyticsPage = lazyWithRetry(() => import("./pages/ExtractionAnalyticsPage"));
const PrismAIPage = lazyWithRetry(() => import("./pages/PrismAIPage"));
const SMSPage = lazyWithRetry(() => import("./pages/SMSPage"));
const DocumentCollectionPortal = lazyWithRetry(() => import("./pages/DocumentCollectionPortal"));
const ModuleBuilderPage = lazyWithRetry(() => import("./pages/ModuleBuilderPage"));
const LewisAIHub = lazyWithRetry(() => import("./pages/ai/LewisAIHub"));
const AIModuleExecute = lazyWithRetry(() => import("./pages/ai/AIModuleExecute"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const CanopyImportPage = lazyWithRetry(() => import("./pages/CanopyImportPage"));
const CoterieQuotesPage = lazyWithRetry(() => import("./pages/CoterieQuotesPage"));
const CEODigestSettings = lazyWithRetry(() => import("./pages/CEODigestSettings"));
const CEODigestHistory = lazyWithRetry(() => import("./pages/CEODigestHistory"));
const ReputationSettings = lazyWithRetry(() => import("./pages/ReputationSettings"));

// Payment Tracking Module
const PaymentList = lazyWithRetry(() => import("./pages/PaymentList"));
const DaySheets = lazyWithRetry(() => import("./pages/DaySheets"));
const DaySheetDetail = lazyWithRetry(() => import("./pages/DaySheetDetail"));
const BankReconciliation = lazyWithRetry(() => import("./pages/BankReconciliation"));

// Training Materials Module
const TrainingMaterials = lazyWithRetry(() => import("./pages/TrainingMaterials"));

// Dec Page Import for Requoting
const DecPageImport = lazyWithRetry(() => import("./pages/DecPageImport"));

// Bulk Import
const BulkImportPage = lazyWithRetry(() => import("./pages/BulkImportPage"));

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
    {/* Calm Command defaults to dark; light theme is a full brand counterpart (design-system/constitution.md). */}
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <NavigationGuardProvider>
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
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <ProducerDashboard />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dashboard/agency"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <AgencyDashboard />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leads"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <Leads />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leads/analytics"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <LeadAnalyticsDashboard />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leads/:id"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <LeadDetail />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/crm"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CRM />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/crm/accounts/:accountId"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <AccountDetail />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/canopy-import"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CanopyImportPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/coterie-quotes"
                  element={
                    <ProtectedRoute requireStaff>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CoterieQuotesPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CustomersPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers/:id"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CustomerDetail />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers/:id/edit"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CustomerEdit />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/policies"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <PoliciesPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/renewals"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <RenewalsPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/renewals/intelligence"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <RenewalIntelligencePage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/renewals/:id/edit"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <RenewalEditPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
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
                      <RenewalRateWatchPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/ao-renewals/rate-watch/:workspaceId"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <RenewalRateWatchPage />
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
                    <ProtectedRoute requireAdmin>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <AdminPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/digest-settings"
                  element={
                    <ProtectedRoute requireAdmin>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CEODigestSettings />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/digest-history"
                  element={
                    <ProtectedRoute requireAdmin>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CEODigestHistory />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings/reputation"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <ReputationSettings />
                      </ErrorBoundary>
                    </ProtectedRoute>
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
                  path="/merge-customers"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <MergeCustomersPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/duplicates"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <DuplicatesReviewPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/team-messaging"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <TeamMessagingPage />
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
                {/* Payment Tracking Module */}
                <Route
                  path="/payments"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <PaymentList />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/day-sheets"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <DaySheets />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/day-sheets/:id"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <DaySheetDetail />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reconciliation"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <BankReconciliation />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                {/* Training Materials Module */}
                <Route
                  path="/training"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <TrainingMaterials />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                {/* Dec Page Import for Requoting */}
                <Route
                  path="/import-dec-page"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <DecPageImport />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                {/* Bulk Import */}
                <Route
                  path="/bulk-import"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <BulkImportPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
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
                  path="/insurance-comparison"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <InsuranceComparison />
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
                      <LewisAIHub />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/module-builder"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <ModuleBuilderPage />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/ai-hub"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <LewisAIHub />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/ai/hub"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <LewisAIHub />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/ai/:moduleSlug"
                  element={
                    <ErrorBoundary level="page" resetOnPropsChange>
                      <AIModuleExecute />
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="/coverage-gap-analysis"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CoverageGapAnalysis />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/coverage-gap-analysis/:accountId"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CoverageGapAnalysis />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/coverage-gap/:analysisId"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CoverageGapDetail />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/issues"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <IssueTracker />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/issues/new"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <ReportIssue />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/issues/:issueId"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <IssueDetail />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/predictive-analytics"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <PredictiveAnalytics />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                {/* Redirect old /operations route to Command Center */}
                <Route path="/operations" element={<ProtectedRoute><CommandCenterPage /></ProtectedRoute>} />
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
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CarrierTemplatesPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/carrier-templates/:id"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CarrierTemplateBuilder />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/carrier-templates/:id/edit"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <CarrierTemplateBuilder />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/extraction-review"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <ExtractionReviewQueue />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/extraction-review/:id"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <ExtractionReviewDetail />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/extraction-analytics"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary level="page" resetOnPropsChange>
                        <ExtractionAnalyticsPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </TooltipProvider>
          </NavigationGuardProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
