// ============================================================================
// CANOPY IMPORT DASHBOARD
// ============================================================================
// Dashboard for managing Canopy Connect insurance data imports
// Shows shareable link, recent imports, and imported lead data
// ============================================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CanopyDataDisplay } from '@/components/canopy/CanopyDataDisplay';
import {
  Shield,
  Copy,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  Car,
  Home,
  Umbrella,
  RefreshCw,
  Send,
  Users,
  Eye,
  X,
} from 'lucide-react';

export default function CanopyImportPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // The shareable Canopy link
  const canopyLink = 'https://app.usecanopy.com/c/lewis-insurance';

  // Get recent Canopy pulls/imports
  const { data: recentPulls, isLoading: isPullsLoading, refetch: refetchPulls } = useQuery({
    queryKey: ['canopy-pulls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_pulls')
        .select(`
          id,
          canopy_pull_id,
          status,
          policy_count,
          carrier_count,
          created_at,
          completed_at,
          lead_id,
          account_id,
          error_message,
          metadata
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
  });

  // Get leads that have linked canopy_pulls, or recent leads
  const { data: canopyLeads, isLoading: isLeadsLoading } = useQuery({
    queryKey: ['canopy-leads'],
    queryFn: async () => {
      // Get leads that are linked to canopy pulls
      const { data: canopyPullLeads } = await supabase
        .from('canopy_pulls')
        .select('lead_id')
        .not('lead_id', 'is', null);

      const canopyLeadIds = canopyPullLeads?.map(p => p.lead_id).filter(Boolean) || [];

      if (canopyLeadIds.length > 0) {
        const { data: linkedLeads, error: linkedError } = await supabase
          .from('leads')
          .select('*')
          .in('id', canopyLeadIds)
          .order('created_at', { ascending: false })
          .limit(10);

        if (linkedError) throw linkedError;
        if (linkedLeads && linkedLeads.length > 0) {
          return linkedLeads.map(l => ({ ...l, isCanopyLead: true }));
        }
      }

      // Fallback: get recent leads
      const { data: recentData, error: recentError } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentError) throw recentError;
      return recentData?.map(l => ({ ...l, isCanopyLead: false })) || [];
    },
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(canopyLink);
      setCopied(true);
      toast({
        title: 'Link copied!',
        description: 'Share this link with customers to import their insurance data.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy the link manually.',
        variant: 'destructive',
      });
    }
  };

  const handleViewLead = (leadId: string) => {
    navigate(`/leads/${leadId}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Complete</Badge>;
      case 'pending':
      case 'processing':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Processing</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Canopy Connect</h1>
            <p className="text-muted-foreground">
              Import verified insurance data from customers via Canopy Connect
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Share Link Card */}
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Share with Customers
                </CardTitle>
                <CardDescription>
                  Send this link to customers. When they connect their insurance,
                  their policy data will automatically appear here as a new lead.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={canopyLink}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button onClick={handleCopyLink} variant={copied ? "default" : "outline"}>
                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={canopyLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>How it works:</strong> Customer clicks link → Selects their carrier →
                  Logs in securely → Policy data is imported → New lead is created automatically
                </p>
              </CardContent>
            </Card>

            {/* Recent Imports */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Imports</CardTitle>
                  <CardDescription>
                    Insurance data imported via Canopy Connect
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => refetchPulls()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {isPullsLoading ? (
                  <p className="text-muted-foreground text-center py-8">Loading...</p>
                ) : recentPulls && recentPulls.length > 0 ? (
                  <div className="space-y-3">
                    {recentPulls.map((pull) => (
                      <div
                        key={pull.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {getStatusBadge(pull.status)}
                          <div>
                            <p className="font-medium">
                              {pull.policy_count || 0} {pull.policy_count === 1 ? 'policy' : 'policies'} imported
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(pull.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {pull.lead_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewLead(pull.lead_id!)}
                          >
                            View Lead <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No imports yet</p>
                    <p className="text-sm">Share the link above with customers to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Leads from Canopy */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {canopyLeads?.some(l => l.isCanopyLead)
                    ? 'Leads from Canopy'
                    : 'Recent Leads'}
                </CardTitle>
                <CardDescription>
                  {canopyLeads?.some(l => l.isCanopyLead)
                    ? 'Leads automatically created from Canopy imports'
                    : 'Your most recent leads (Canopy imports will appear here)'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLeadsLoading ? (
                  <p className="text-muted-foreground text-center py-8">Loading...</p>
                ) : canopyLeads && canopyLeads.length > 0 ? (
                  <div className="space-y-3">
                    {canopyLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => handleViewLead(lead.id)}
                      >
                        <div>
                          <p className="font-medium">
                            {lead.first_name} {lead.last_name}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{lead.email || 'No email'}</span>
                            {lead.insurance_types && (
                              <span>• {(lead.insurance_types as string[]).join(', ')}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Score: {lead.lead_score || 0}</Badge>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No leads from Canopy yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* How It Works */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How It Works</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-primary text-primary-foreground text-sm font-medium">
                      1
                    </span>
                    <div>
                      <p className="font-medium">Send Link</p>
                      <p className="text-sm text-muted-foreground">
                        Share the Canopy link with your customer via email, SMS, or in person
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-primary text-primary-foreground text-sm font-medium">
                      2
                    </span>
                    <div>
                      <p className="font-medium">Customer Connects</p>
                      <p className="text-sm text-muted-foreground">
                        They select their carrier and securely log in to authorize access
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-primary text-primary-foreground text-sm font-medium">
                      3
                    </span>
                    <div>
                      <p className="font-medium">Data Imported</p>
                      <p className="text-sm text-muted-foreground">
                        Policy, vehicle, driver, and coverage info is automatically pulled
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-primary text-primary-foreground text-sm font-medium">
                      4
                    </span>
                    <div>
                      <p className="font-medium">Lead Created</p>
                      <p className="text-sm text-muted-foreground">
                        A new qualified lead is created with all their insurance details
                      </p>
                    </div>
                  </li>
                </ol>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Import Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Imports</span>
                  <span className="font-bold text-lg">{recentPulls?.length || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-bold text-lg text-green-600">
                    {recentPulls?.filter(p => p.status === 'complete').length || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Leads Created</span>
                  <span className="font-bold text-lg">{canopyLeads?.length || 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Supported Carriers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">400+ Carriers Supported</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {['State Farm', 'Geico', 'Progressive', 'Allstate', 'Liberty Mutual', 'USAA', 'Farmers', 'Nationwide', '+392 more'].map((carrier) => (
                    <Badge key={carrier} variant="secondary" className="text-xs">
                      {carrier}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
