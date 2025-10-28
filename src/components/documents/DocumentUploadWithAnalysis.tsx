import React, { useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDocumentUploadAndAnalysis, AnalysisMode } from '@/hooks/useDocumentAnalysis';

interface DocumentUploadWithAnalysisProps {
  accountId?: string;
  onComplete?: (result: any) => void;
}

export const DocumentUploadWithAnalysis: React.FC<DocumentUploadWithAnalysisProps> = ({
  accountId,
  onComplete
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const { 
    uploadAndAnalyze, 
    isUploading, 
    uploadProgress, 
    isAnalyzing, 
    analysisProgress,
    isProcessing 
  } = useDocumentUploadAndAnalysis();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setErrorMessage(null); // Clear previous errors

    try {
      const result = await uploadAndAnalyze({
        file: selectedFile,
        accountId: accountId,
        analysisMode: analysisMode,
        workflowContext: {
          source: 'manual_upload',
          account_id: accountId
        }
      });

      if (onComplete) {
        onComplete(result);
      }

      setSelectedFile(null);
    } catch (error: any) {
      console.error('Upload error:', error);
      
      // Extract and display the full error message
      let errorText = 'An unknown error occurred';
      
      if (error?.message) {
        errorText = error.message;
      } else if (typeof error === 'string') {
        errorText = error;
      } else if (error?.error) {
        errorText = error.error;
      }
      
      setErrorMessage(errorText);
    }
  };

  const totalProgress = isUploading 
    ? uploadProgress 
    : isAnalyzing 
    ? analysisProgress 
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload & Analyze Document</CardTitle>
        <CardDescription>
          Upload insurance documents for AI-powered analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Analysis Error</AlertTitle>
            <AlertDescription className="mt-2 text-sm whitespace-pre-wrap">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Analysis Mode</label>
          <Select
            value={analysisMode}
            onValueChange={(value) => setAnalysisMode(value as AnalysisMode)}
            disabled={isProcessing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Complete Analysis (Recommended)</SelectItem>
              <SelectItem value="parse">Parse Data Only</SelectItem>
              <SelectItem value="summarize">Summarize Document</SelectItem>
              <SelectItem value="classify">Classify Document</SelectItem>
              <SelectItem value="insights">Generate Insights</SelectItem>
              <SelectItem value="workflow">Workflow Automation</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          {selectedFile ? (
            <div className="space-y-4">
              <FileText className="h-12 w-12 mx-auto text-blue-500" />
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                onClick={() => setSelectedFile(null)}
                variant="outline"
                size="sm"
                disabled={isProcessing}
              >
                Change File
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">
                    Choose a file
                  </span>
                  <span className="text-muted-foreground"> or drag and drop</span>
                </label>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.docx"
                  onChange={handleFileSelect}
                  disabled={isProcessing}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                PDF, JPEG, PNG, DOCX (max 50MB)
              </p>
            </div>
          )}
        </div>

        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isUploading ? 'Uploading...' : 'Analyzing...'}
              </span>
              <span className="font-medium">{totalProgress}%</span>
            </div>
            <Progress value={totalProgress} />
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={!selectedFile || isProcessing}
          className="w-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isUploading ? 'Uploading...' : 'Analyzing...'}
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload & Analyze
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
