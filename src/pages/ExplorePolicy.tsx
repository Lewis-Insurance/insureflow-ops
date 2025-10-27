import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, FileText } from 'lucide-react';

export default function ExplorePolicy() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateWorkspace = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please upload at least one file to analyze",
        variant: "destructive",
      });
      return;
    }

    if (!prompt.trim()) {
      toast({
        title: "No question provided",
        description: "Please enter a question or prompt",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Creating workspace",
      description: "Your policy analysis workspace is being created...",
    });

    // TODO: Implement workspace creation logic
    // This would typically create a session and navigate to a results page
  };

  const handleClose = () => {
    navigate(-1);
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="bg-card rounded-lg border p-8 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold mb-2">Explore a Policy</h1>
            <p className="text-muted-foreground">
              Ask Lewis AI to answer questions about a policy, quote, binder, or other document
            </p>
          </div>

          {/* Input Files Section */}
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold mb-1">Input Files</h2>
              <p className="text-sm text-muted-foreground">
                Files you'd like Lewis AI to use as context to answer questions
              </p>
            </div>

            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                transition-colors duration-200
                ${isDragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/30'
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-sm text-muted-foreground">
                Drag and drop files here
              </p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2 mt-4">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeFile(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Question or Prompt Section */}
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold mb-1">Question or Prompt</h2>
              <p className="text-sm text-muted-foreground">
                Any question or prompt you'd like Lewis AI to answer about the documents.
              </p>
            </div>

            <Textarea
              placeholder="Enter your question here..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[200px] resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              size="lg"
            >
              Close
            </Button>
            <Button
              onClick={handleCreateWorkspace}
              size="lg"
              className="bg-primary hover:bg-primary/90"
            >
              Create Workspace
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
