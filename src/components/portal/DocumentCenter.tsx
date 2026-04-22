// ============================================================================
// DOCUMENT CENTER COMPONENT
// ============================================================================
// Document listing and download
// ============================================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  FileText,
  Search,
  Calendar,
  Eye,
  Loader2,
  Filter,
} from 'lucide-react';
import { usePortalDocuments } from '@/hooks/usePortalDocuments';
import { DataAsOfBadge } from './DataAsOfBadge';
import { POLICY_DATA_DISCLAIMER } from '@/types/portal';
import type { PortalDocument, DocumentType } from '@/types/portal';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  dec_page: 'Declaration Page',
  id_card: 'ID Card',
  certificate: 'Certificate',
  endorsement: 'Endorsement',
  invoice: 'Invoice',
  application: 'Application',
  other: 'Other',
};

interface DocumentCenterProps {
  policyId?: string;
}

export function DocumentCenter({ policyId }: DocumentCenterProps) {
  const { documents, isLoading, getDocumentUrl } = usePortalDocuments(policyId);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

  const handleDownload = async (docId: string) => {
    setLoadingDoc(docId);
    try {
      const url = await getDocumentUrl(docId);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to download document:', error);
    } finally {
      setLoadingDoc(null);
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.document_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || doc.document_type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-48 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Disclaimer Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <p>{POLICY_DATA_DISCLAIMER}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document List */}
      {filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>
              {documents.length === 0
                ? 'No documents available'
                : 'No documents match your search'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => (
            <DocumentItem
              key={doc.id}
              document={doc}
              isLoading={loadingDoc === doc.id}
              onDownload={() => handleDownload(doc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DocumentItemProps {
  document: PortalDocument;
  isLoading: boolean;
  onDownload: () => void;
}

function DocumentItem({ document, isLoading, onDownload }: DocumentItemProps) {
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">{document.document_name}</h3>
              <Badge variant="secondary" className="text-xs">
                {DOCUMENT_TYPE_LABELS[document.document_type]}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {document.document_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatLocalDateDisplay(document.document_date)}
                </span>
              )}
              {document.file_size_bytes && (
                <span>{formatFileSize(document.file_size_bytes)}</span>
              )}
              {document.download_count > 0 && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {document.download_count} downloads
                </span>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
