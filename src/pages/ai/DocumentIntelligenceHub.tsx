/**
 * Document Intelligence Hub (Enhanced)
 * 
 * Shows all documents WITH their relationships to accounts, leads, and policies.
 * Features:
 * - Document grid with entity badges
 * - Quick link dialog for orphaned documents
 * - Unlinked filter toggle
 * - AI search integration
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Brain,
  Search,
  Sparkles,
  FileText,
  Upload,
  Eye,
  Download,
  Link2,
  MoreVertical,
  User,
  Target,
  Building2,
  AlertTriangle,
  Filter,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useDocumentsWithRelationships, DocumentWithRelationships } from '@/integrations/supabase/hooks/useAIModules';
import { LinkDocumentDialog } from '@/components/documents/LinkDocumentDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Document type colors
const DOC_TYPE_COLORS: Record<string, string> = {
  policy: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  quote: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  certificate: 'bg-green-500/10 text-green-600 border-green-500/20',
  application: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  claim: 'bg-red-500/10 text-red-600 border-red-500/20',
  invoice: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  contract: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
};

export default function DocumentIntelligenceHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('all');
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{ id: string; filename: string } | null>(null);

  const { data: documents = [], isLoading, refetch } = useDocumentsWithRelationships({
    document_type: documentTypeFilter !== 'all' ? documentTypeFilter : undefined,
    unlinked_only: showUnlinkedOnly,
    search: searchQuery || undefined,
    limit: 100,
  });

  const handleAISearch = () => {
    if (searchQuery.trim()) {
      navigate(`/ai/document-intelligence?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleViewDocument = async (doc: DocumentWithRelationships) => {
    try {
      if (doc.storage_path) {
        const { data } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.storage_path, 3600);
        
        if (data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Could not open document',
        variant: 'destructive',
      });
    }
  };

  const handleLinkDocument = (doc: DocumentWithRelationships) => {
    setSelectedDocument({ id: doc.id, filename: doc.filename });
    setLinkDialogOpen(true);
  };

  const getEntityBadge = (doc: DocumentWithRelationships) => {
    if (doc.account) {
      return (
        <Badge variant="outline" className="gap-1 text-xs">
          <User className="h-3 w-3" />
          {doc.account.name}
        </Badge>
      );
    }
    if (doc.lead) {
      return (
        <Badge variant="outline" className="gap-1 text-xs bg-orange-500/10 text-orange-600 border-orange-500/20">
          <Target className="h-3 w-3" />
          {doc.lead.name}
        </Badge>
      );
    }
    if (doc.policy) {
      return (
        <Badge variant="outline" className="gap-1 text-xs bg-blue-500/10 text-blue-600 border-blue-500/20">
          <Building2 className="h-3 w-3" />
          {doc.policy.policy_number}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
        <AlertTriangle className="h-3 w-3" />
        Unlinked
      </Badge>
    );
  };

  const isUnlinked = (doc: DocumentWithRelationships) => {
    return !doc.account && !doc.lead && !doc.policy;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/ai/hub')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600">
                  <Brain className="h-7 w-7 text-white" />
                </div>
                Document Intelligence Hub
              </h1>
              <p className="text-muted-foreground">
                Enhanced OCR + AI analysis for policies and documents
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {documents.length} Documents
          </Badge>
        </div>

        {/* Search Bar */}
        <Card className="bg-gradient-to-r from-slate-500/5 to-blue-500/5 border-slate-500/20">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Ask anything about your policies and documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAISearch()}
                  className="pl-10 h-12 text-base bg-background"
                />
              </div>
              <Button 
                size="lg" 
                onClick={handleAISearch}
                disabled={!searchQuery.trim()}
                className="px-6"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                AI Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="policy">Policy</SelectItem>
              <SelectItem value="quote">Quote</SelectItem>
              <SelectItem value="certificate">Certificate</SelectItem>
              <SelectItem value="application">Application</SelectItem>
              <SelectItem value="claim">Claim</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Checkbox
              id="unlinked"
              checked={showUnlinkedOnly}
              onCheckedChange={(checked) => setShowUnlinkedOnly(checked as boolean)}
            />
            <Label htmlFor="unlinked" className="text-sm cursor-pointer">
              Unlinked Only
            </Label>
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        {/* Document Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Documents Found</h3>
              <p className="text-muted-foreground mb-4">
                {showUnlinkedOnly 
                  ? 'All documents are linked to accounts, leads, or policies.'
                  : 'Upload documents to get started with AI-powered analysis.'}
              </p>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload Documents
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <Card 
                key={doc.id} 
                className={cn(
                  'hover:shadow-lg transition-all duration-200',
                  isUnlinked(doc) && 'border-yellow-500/30'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm truncate" title={doc.filename}>
                          {doc.filename}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {doc.document_type || 'Unknown type'}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDocument(doc)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewDocument(doc)}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        {isUnlinked(doc) && (
                          <DropdownMenuItem onClick={() => handleLinkDocument(doc)}>
                            <Link2 className="h-4 w-4 mr-2" />
                            Link to Record
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Entity Badge */}
                  <div className="mb-3">
                    {getEntityBadge(doc)}
                  </div>

                  {/* Document Type Badge */}
                  {doc.document_type && (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        'text-xs mb-3',
                        DOC_TYPE_COLORS[doc.document_type] || ''
                      )}
                    >
                      {doc.document_type}
                    </Badge>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                    <span>
                      {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleViewDocument(doc)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isUnlinked(doc) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleLinkDocument(doc)}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Link Document Dialog */}
        <LinkDocumentDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          document={selectedDocument}
        />
      </div>
    </AppLayout>
  );
}

