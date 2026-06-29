import React, { useState } from 'react';
import { Upload, Loader2, X, FileCheck, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionLabel } from '@/components/cc';
import { useDocumentComparison } from '@/hooks/useDocumentAnalysis';
import { cn } from '@/lib/utils';

interface DocumentComparisonUploaderProps {
  accountId?: string;
  minDocuments?: number;
  maxDocuments?: number;
}

type DocRole = 'CURRENT_POLICY' | 'QUOTE';

interface SelectedDocument {
  id: string;
  file: File;
  label: string;
  role: DocRole;
}

export const DocumentComparisonUploader: React.FC<DocumentComparisonUploaderProps> = ({
  accountId,
  minDocuments = 2,
  maxDocuments = 5,
}) => {
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const { compareDocuments, isComparing, progress } = useDocumentComparison();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const newDocs = files.map((file, index) => {
      const docIndex = documents.length + index;
      return {
        id: `${Date.now()}-${index}`,
        file,
        label: docIndex === 0 ? 'Current Policy' : `Quote ${docIndex}`,
        role: (docIndex === 0 ? 'CURRENT_POLICY' : 'QUOTE') as DocRole,
      };
    });
    setDocuments((prev) => [...prev, ...newDocs].slice(0, maxDocuments));
    event.target.value = '';
  };

  const updateRole = (id: string, role: DocRole) =>
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, role } : doc)));

  const removeDocument = (id: string) =>
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));

  const updateLabel = (id: string, label: string) =>
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, label } : doc)));

  const handleCompare = async () => {
    if (documents.length < minDocuments) return;
    try {
      await compareDocuments(
        documents.map((doc) => ({ file: doc.file, label: doc.label, role: doc.role })),
        accountId,
      );
      setDocuments([]);
    } catch (error) {
      console.error('Comparison error:', error);
    }
  };

  const needMore = minDocuments - documents.length;

  return (
    <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
      <div className="border-b border-cc-border-subtle px-5 py-4">
        <h2 className="text-sm font-semibold text-cc-text-primary">Upload documents to compare</h2>
        <p className="mt-0.5 text-sm text-cc-text-muted">
          Add {minDocuments} to {maxDocuments} insurance documents to line up side by side.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {documents.length > 0 && (
          <div className="space-y-2.5">
            {documents.map((doc, index) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-3"
              >
                {doc.role === 'CURRENT_POLICY' ? (
                  <FileCheck className="h-7 w-7 shrink-0 text-cc-text-secondary" aria-hidden="true" />
                ) : (
                  <FileQuestion className="h-7 w-7 shrink-0 text-cc-text-secondary" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={doc.label}
                      onChange={(e) => updateLabel(doc.id, e.target.value)}
                      placeholder={`Document ${index + 1}`}
                      aria-label={`Label for document ${index + 1}`}
                      disabled={isComparing}
                      className="h-8 flex-1 rounded-cc-md border-cc-border-interactive bg-cc-surface text-cc-text-primary placeholder:text-cc-text-muted"
                    />
                    <Select
                      value={doc.role}
                      onValueChange={(value) => updateRole(doc.id, value as DocRole)}
                      disabled={isComparing}
                    >
                      <SelectTrigger
                        aria-label={`Role for ${doc.label}`}
                        className="h-8 w-[170px] rounded-cc-md border-cc-border-interactive bg-cc-surface text-cc-text-primary"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CURRENT_POLICY">Current policy</SelectItem>
                        <SelectItem value="QUOTE">Quote / proposal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="cc-num truncate text-xs text-cc-text-muted">
                    {doc.file.name} ({(doc.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                </div>
                <Button
                  onClick={() => removeDocument(doc.id)}
                  variant="ghost"
                  size="icon"
                  disabled={isComparing}
                  aria-label={`Remove ${doc.label}`}
                  className="shrink-0 text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {documents.length < maxDocuments && (
          <div className="rounded-cc-lg border-2 border-dashed border-cc-border-interactive p-8 text-center transition-colors hover:border-cc-accent">
            <Upload className="mx-auto mb-3 h-10 w-10 text-cc-text-muted" aria-hidden="true" />
            <label htmlFor="comparison-upload" className="cursor-pointer">
              <span className="font-medium text-cc-text-primary underline-offset-4 hover:underline">
                {documents.length === 0 ? 'Choose files' : 'Add more files'}
              </span>
              <span className="text-cc-text-muted"> or drag and drop</span>
            </label>
            {/* sr-only (not hidden) so the input stays in the tab order and a */}
            {/* keyboard user can open the picker; the label click path is unchanged. */}
            <input
              id="comparison-upload"
              type="file"
              className="sr-only"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              disabled={isComparing}
              multiple
            />
            <p className="cc-num mt-2 text-xs text-cc-text-muted">
              {documents.length} of {maxDocuments} documents selected
            </p>
          </div>
        )}

        {isComparing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-cc-text-secondary">Analyzing and comparing documents</span>
              <span className="cc-num font-medium text-cc-text-primary">{progress}%</span>
            </div>
            <Progress value={progress} aria-label="Comparison progress" aria-valuenow={progress} />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            data-primary
            onClick={handleCompare}
            disabled={documents.length < minDocuments || isComparing}
            className="flex-1 gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
          >
            {isComparing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Comparing
              </>
            ) : (
              <>Compare {documents.length || ''} documents</>
            )}
          </Button>

          {documents.length > 0 && !isComparing && (
            <Button
              onClick={() => setDocuments([])}
              variant="outline"
              className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
            >
              Clear all
            </Button>
          )}
        </div>

        {needMore > 0 && documents.length > 0 && (
          <p className="text-sm text-cc-warning">
            Add at least {needMore} more document{needMore > 1 ? 's' : ''} to compare.
          </p>
        )}

        {documents.length >= minDocuments && (
          <div className="rounded-cc-lg border border-cc-border-subtle bg-cc-surface-raised p-3">
            <SectionLabel>Comparison setup</SectionLabel>
            <ul className="mt-2 space-y-1 text-xs text-cc-text-secondary">
              <li>
                <span className="font-medium text-cc-text-primary">Current policy</span> is your existing in-force
                policy or dec page.
              </li>
              <li>
                <span className="font-medium text-cc-text-primary">Quote</span> is the quote, proposal, or binder you
                are comparing.
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
