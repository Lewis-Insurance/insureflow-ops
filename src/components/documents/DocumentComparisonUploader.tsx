import React, { useState } from 'react';
import { Upload, FileText, Loader2, X, FileCheck, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useDocumentComparison } from '@/hooks/useDocumentAnalysis';

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
  maxDocuments = 5
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
        role: (docIndex === 0 ? 'CURRENT_POLICY' : 'QUOTE') as DocRole
      };
    });

    setDocuments(prev => [...prev, ...newDocs].slice(0, maxDocuments));
    event.target.value = '';
  };

  const updateRole = (id: string, role: DocRole) => {
    setDocuments(prev => 
      prev.map(doc => doc.id === id ? { ...doc, role } : doc)
    );
  };

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const updateLabel = (id: string, label: string) => {
    setDocuments(prev => 
      prev.map(doc => doc.id === id ? { ...doc, label } : doc)
    );
  };

  const handleCompare = async () => {
    if (documents.length < minDocuments) {
      return;
    }

    // Validate: need at least one CURRENT_POLICY
    const hasCurrentPolicy = documents.some(d => d.role === 'CURRENT_POLICY');
    const hasQuote = documents.some(d => d.role === 'QUOTE');
    
    if (!hasCurrentPolicy || !hasQuote) {
      console.warn('Comparison requires at least one Current Policy and one Quote');
    }

    try {
      await compareDocuments(
        documents.map(doc => ({ 
          file: doc.file, 
          label: doc.label,
          role: doc.role 
        })),
        accountId
      );
      
      setDocuments([]);
    } catch (error) {
      console.error('Comparison error:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Documents to Compare</CardTitle>
        <CardDescription>
          Upload {minDocuments}-{maxDocuments} insurance documents to compare side-by-side
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {documents.length > 0 && (
          <div className="space-y-3">
            {documents.map((doc, index) => (
              <div key={doc.id} className={`flex items-center gap-3 p-3 border rounded-lg ${
                doc.role === 'CURRENT_POLICY' 
                  ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20' 
                  : 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
              }`}>
                {doc.role === 'CURRENT_POLICY' ? (
                  <FileCheck className="h-8 w-8 text-blue-500 flex-shrink-0" />
                ) : (
                  <FileQuestion className="h-8 w-8 text-amber-500 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={doc.label}
                      onChange={(e) => updateLabel(doc.id, e.target.value)}
                      placeholder={`Document ${index + 1}`}
                      disabled={isComparing}
                      className="h-8 flex-1"
                    />
                    <Select
                      value={doc.role}
                      onValueChange={(value) => updateRole(doc.id, value as DocRole)}
                      disabled={isComparing}
                    >
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CURRENT_POLICY">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700">A</Badge>
                            Current Policy
                          </div>
                        </SelectItem>
                        <SelectItem value="QUOTE">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700">B</Badge>
                            Quote/Proposal
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {doc.file.name} ({(doc.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                </div>
                <Button
                  onClick={() => removeDocument(doc.id)}
                  variant="ghost"
                  size="icon"
                  disabled={isComparing}
                  className="flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {documents.length < maxDocuments && (
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <div className="space-y-2">
              <label htmlFor="comparison-upload" className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-700 font-medium">
                  {documents.length === 0 ? 'Choose files' : 'Add more files'}
                </span>
                <span className="text-muted-foreground"> or drag and drop</span>
              </label>
              <input
                id="comparison-upload"
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                disabled={isComparing}
                multiple
              />
              <p className="text-xs text-muted-foreground">
                {documents.length} of {maxDocuments} documents selected
              </p>
            </div>
          </div>
        )}

        {isComparing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Analyzing and comparing documents...
              </span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleCompare}
            disabled={documents.length < minDocuments || isComparing}
            className="flex-1"
          >
            {isComparing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                Compare {documents.length} Documents
              </>
            )}
          </Button>
          
          {documents.length > 0 && !isComparing && (
            <Button
              onClick={() => setDocuments([])}
              variant="outline"
            >
              Clear All
            </Button>
          )}
        </div>

        {documents.length < minDocuments && documents.length > 0 && (
          <p className="text-sm text-amber-600">
            Please add at least {minDocuments - documents.length} more document(s) to compare
          </p>
        )}
        
        {documents.length >= minDocuments && (
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p className="font-medium mb-1">📋 Comparison Setup</p>
            <ul className="space-y-1 text-xs">
              <li>• <span className="text-blue-600 font-medium">Document A (Current Policy)</span>: Your existing in-force policy or dec page</li>
              <li>• <span className="text-amber-600 font-medium">Document B (Quote)</span>: The quote, proposal, or binder you're comparing</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
