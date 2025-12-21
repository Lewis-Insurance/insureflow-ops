import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreVertical,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  RefreshCw,
  Filter,
  TrendingUp,
  Brain,
  Target,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Extraction {
  id: string;
  document_name: string;
  document_type: string;
  status: string;
  confidence_tier: string;
  review_status: string;
  review_priority: number;
  extracted_fields: Record<string, any>;
  auto_applied_fields: string[];
  needs_review_fields: string[];
  flagged_fields: string[];
  created_at: string;
  extraction_completed_at: string;
  account?: { name: string };
  acord_form?: { id: string };
  matched_template?: { template_name: string; carrier_name: string };
}

export default function ExtractionReviewQueue() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pending');
  const [stats, setStats] = useState({
    pending: 0,
    inReview: 0,
    approved: 0,
    rejected: 0,
    avgConfidence: 0,
    totalLearned: 0,
  });

  useEffect(() => {
    loadExtractions();
    loadStats();
  }, [activeTab]);

  const loadExtractions = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('document_extractions')
        .select(`
          *,
          accounts!account_id(name),
          acord_forms!acord_form_id(id),
          carrier_document_templates!matched_template_id(template_name, carrier_name)
        `)
        .order('review_priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (activeTab !== 'all') {
        query = query.eq('review_status', activeTab);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      setExtractions((data || []).map((e: any) => ({
        ...e,
        account: e.accounts,
        acord_form: e.acord_forms,
        matched_template: e.carrier_document_templates,
      })));
    } catch (error: any) {
      toast({
        title: 'Error loading extractions',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Get counts by status
      const { data: pendingData } = await supabase
        .from('document_extractions')
        .select('id', { count: 'exact' })
        .eq('review_status', 'pending');

      const { data: inReviewData } = await supabase
        .from('document_extractions')
        .select('id', { count: 'exact' })
        .eq('review_status', 'in_review');

      const { data: approvedData } = await supabase
        .from('document_extractions')
        .select('id', { count: 'exact' })
        .eq('review_status', 'approved');

      const { data: learnedRules } = await supabase
        .from('extraction_learned_rules')
        .select('id', { count: 'exact' })
        .eq('is_active', true);

      setStats({
        pending: pendingData?.length || 0,
        inReview: inReviewData?.length || 0,
        approved: approvedData?.length || 0,
        rejected: 0,
        avgConfidence: 0,
        totalLearned: learnedRules?.length || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const updateReviewStatus = async (extractionId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('document_extractions')
        .update({
          review_status: status,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', extractionId);

      if (error) throw error;

      toast({ title: `Extraction ${status}` });
      loadExtractions();
      loadStats();
    } catch (error: any) {
      toast({
        title: 'Error updating status',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getConfidenceTierBadge = (tier: string) => {
    switch (tier) {
      case 'high':
        return <Badge className="bg-green-100 text-green-800">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>;
      case 'low':
        return <Badge className="bg-red-100 text-red-800">Low</Badge>;
      default:
        return <Badge variant="secondary">{tier}</Badge>;
    }
  };

  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case 'in_review':
        return <Badge className="bg-blue-100 text-blue-800">In Review</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const filteredExtractions = extractions.filter(e =>
    e.document_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.document_type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.account?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Extraction Review Queue</h1>
            <p className="text-muted-foreground">
              Review and approve extracted document data
            </p>
          </div>
          <Button onClick={loadExtractions} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Eye className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.inReview}</p>
                  <p className="text-sm text-muted-foreground">In Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Brain className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalLearned}</p>
                  <p className="text-sm text-muted-foreground">Learned Rules</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">--</p>
                  <p className="text-sm text-muted-foreground">Avg Accuracy</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs and Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-between items-center">
                  <TabsList>
                    <TabsTrigger value="pending">
                      Pending
                      {stats.pending > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {stats.pending}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="in_review">In Review</TabsTrigger>
                    <TabsTrigger value="approved">Approved</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                  </TabsList>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search extractions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading extractions...
              </div>
            ) : filteredExtractions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No extractions found</h3>
                <p className="text-muted-foreground">
                  {activeTab === 'pending'
                    ? 'All extractions have been reviewed'
                    : 'No extractions match your search'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Template Match</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExtractions.map((extraction) => (
                    <TableRow key={extraction.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{extraction.document_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {extraction.account?.name || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {extraction.document_type?.replace('_', ' ') || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getConfidenceTierBadge(extraction.confidence_tier)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          {extraction.auto_applied_fields?.length > 0 && (
                            <span className="text-green-600" title="Auto-applied">
                              <CheckCircle className="h-3 w-3 inline mr-1" />
                              {extraction.auto_applied_fields.length}
                            </span>
                          )}
                          {extraction.needs_review_fields?.length > 0 && (
                            <span className="text-yellow-600" title="Needs review">
                              <AlertTriangle className="h-3 w-3 inline mr-1" />
                              {extraction.needs_review_fields.length}
                            </span>
                          )}
                          {extraction.flagged_fields?.length > 0 && (
                            <span className="text-red-600" title="Flagged">
                              <XCircle className="h-3 w-3 inline mr-1" />
                              {extraction.flagged_fields.length}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {extraction.matched_template ? (
                          <div className="flex items-center gap-1">
                            <Target className="h-3 w-3 text-green-500" />
                            <span className="text-sm">
                              {extraction.matched_template.carrier_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getReviewStatusBadge(extraction.review_status)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(extraction.created_at), {
                          addSuffix: true,
                        })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate(`/extraction-review/${extraction.id}`)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Review
                            </DropdownMenuItem>
                            {extraction.review_status !== 'approved' && (
                              <DropdownMenuItem
                                onClick={() => updateReviewStatus(extraction.id, 'approved')}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Approve
                              </DropdownMenuItem>
                            )}
                            {extraction.review_status !== 'rejected' && (
                              <DropdownMenuItem
                                onClick={() => updateReviewStatus(extraction.id, 'rejected')}
                                className="text-red-600"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
