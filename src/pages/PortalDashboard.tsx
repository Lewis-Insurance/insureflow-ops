// ============================================================================
// PORTAL DASHBOARD PAGE
// ============================================================================
// Client portal main dashboard
// ============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CreditCard,
  FileText,
  HelpCircle,
  LogOut,
  MessageSquare,
  Shield,
  Smartphone,
  Users,
  Gift,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { IDCardView } from '@/components/portal/IDCardView';
import { DocumentCenter } from '@/components/portal/DocumentCenter';
import { ServiceRequestForm } from '@/components/portal/ServiceRequestForm';
import { POLICY_DATA_DISCLAIMER } from '@/types/portal';

export default function PortalDashboard() {
  const { user, branding, loading, signOut, isAuthenticated } = usePortalAuth();
  const [activeTab, setActiveTab] = useState('id-cards');
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate('/portal/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {branding?.logo_url && (
                <img
                  src={branding.logo_url}
                  alt={branding.agency_name}
                  className="h-10"
                />
              )}
              <div>
                <h1 className="font-semibold">{branding?.agency_name || 'Client Portal'}</h1>
                <p className="text-sm text-muted-foreground">
                  Welcome back, {user?.first_name || 'Valued Client'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Disclaimer Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-800 font-medium">Important Notice</p>
              <p className="text-sm text-amber-700">{POLICY_DATA_DISCLAIMER}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickActionCard
            icon={<Smartphone className="h-6 w-6" />}
            label="ID Cards"
            onClick={() => setActiveTab('id-cards')}
            active={activeTab === 'id-cards'}
          />
          <QuickActionCard
            icon={<FileText className="h-6 w-6" />}
            label="Documents"
            onClick={() => setActiveTab('documents')}
            active={activeTab === 'documents'}
          />
          <QuickActionCard
            icon={<HelpCircle className="h-6 w-6" />}
            label="Get Help"
            onClick={() => setActiveTab('service-requests')}
            active={activeTab === 'service-requests'}
          />
          <QuickActionCard
            icon={<CreditCard className="h-6 w-6" />}
            label="Pay Bill"
            onClick={() => window.open('#', '_blank')}
            external
          />
        </div>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="id-cards">
              <Smartphone className="h-4 w-4 mr-2" />
              ID Cards
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="service-requests">
              <MessageSquare className="h-4 w-4 mr-2" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="household">
              <Users className="h-4 w-4 mr-2" />
              Household
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="id-cards">
              <IDCardView showWalletButtons={branding?.features_enabled?.apple_wallet || branding?.features_enabled?.google_wallet} />
            </TabsContent>

            <TabsContent value="documents">
              <DocumentCenter />
            </TabsContent>

            <TabsContent value="service-requests">
              <ServiceRequestForm />
            </TabsContent>

            <TabsContent value="household">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Household Members
                  </CardTitle>
                  <CardDescription>
                    Add family members to share access to your insurance information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Household member management coming soon.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <footer className="border-t pt-6 mt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              {branding?.support_phone && (
                <a href={`tel:${branding.support_phone}`} className="hover:underline">
                  {branding.support_phone}
                </a>
              )}
              {branding?.support_email && (
                <a href={`mailto:${branding.support_email}`} className="hover:underline">
                  {branding.support_email}
                </a>
              )}
            </div>
            <div className="flex items-center gap-4">
              {branding?.privacy_policy_url && (
                <a href={branding.privacy_policy_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Privacy Policy
                </a>
              )}
              {branding?.terms_of_service_url && (
                <a href={branding.terms_of_service_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Terms of Service
                </a>
              )}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

interface QuickActionCardProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  external?: boolean;
}

function QuickActionCard({ icon, label, onClick, active, external }: QuickActionCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center p-4 rounded-lg border transition-colors
        ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-white hover:bg-muted/50'}
      `}
    >
      {icon}
      <span className="text-sm font-medium mt-2 flex items-center gap-1">
        {label}
        {external && <ExternalLink className="h-3 w-3" />}
      </span>
    </button>
  );
}
