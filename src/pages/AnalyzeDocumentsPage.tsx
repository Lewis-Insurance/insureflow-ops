import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentAnalysisUpload } from '@/components/document-analysis/DocumentAnalysisUpload';
import { StorageDiagnostics } from '@/components/document-analysis/StorageDiagnostics';

export default function AnalyzeDocumentsPage() {
  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-6">
        <h1 className="text-3xl font-bold mb-2">Document Analysis</h1>
        <p className="text-muted-foreground mb-8">
          Upload and analyze insurance documents with AI
        </p>
        <div className="space-y-6">
          <DocumentAnalysisUpload />
          <StorageDiagnostics />
        </div>
      </div>
    </AppLayout>
  );
}
