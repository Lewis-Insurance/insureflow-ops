import React, { useState } from 'react';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useDocumentComparison } from '@/hooks/useDocumentAnalysis';

interface DocumentComparisonUploaderProps {
  accountId?: string;
  minDocuments?: number;
  maxDocuments?: number;
}

interface SelectedDocument {
  id: string;
  file: File;
  label: string;
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
    
    const newDocs = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      label: `Option ${documents.length + index + 1}`
    }));

    setDocuments(prev => [...prev, ...newDocs].slice(0, maxDocuments));
    event.target.value = '';
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

    try {
      await compareDocuments(
        documents.map(doc => ({ file: doc.file, label: doc.label })),
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
              <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Input
                    value={doc.label}
                    onChange={(e) => updateLabel(doc.id, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    disabled={isComparing}
                    className="h-8"
                  />
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
      </CardContent>
    </Card>
  );
};
