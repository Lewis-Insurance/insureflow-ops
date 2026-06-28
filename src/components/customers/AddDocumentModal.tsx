import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Upload, X, File, FileText, Image } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface AddDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  onSuccess?: () => void;
}

const DOCUMENT_TYPES = [
  { value: 'policy', label: 'Policy Document' },
  { value: 'dec_page', label: 'Declaration Page' },
  { value: 'id_card', label: 'ID Card' },
  { value: 'coi', label: 'Certificate of Insurance' },
  { value: 'application', label: 'Application' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'claims', label: 'Claims Document' },
  { value: 'billing', label: 'Billing Statement' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
];

export function AddDocumentModal({ open, onOpenChange, accountId, onSuccess }: AddDocumentModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('other');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
  });

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
    if (file.type === 'application/pdf') return <FileText className="h-8 w-8 text-red-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  async function handleUpload() {
    if (!file) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in',
          variant: 'destructive',
        });
        return;
      }

      // Create unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${accountId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { error: dbError } = await supabase
        .from('documents')
        .insert([{
          account_id: accountId,
          name: file.name,
          filename: file.name,
          storage_path: fileName,
          storage_bucket: 'documents',
          file_path: fileName,
          mime_type: file.type,
          file_size: file.size,
          document_type: documentType,
          kind: 'customer_document',
          uploaded_by: user.id,
          file_missing: false,
          tags: description.trim() ? [description.trim()] : null,
        }]);

      if (dbError) throw dbError;

      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });

      // Reset form
      setFile(null);
      setDocumentType('other');
      setDescription('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload document',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-cyan-600" />
            Upload Document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Drop Zone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950' : 'border-gray-300 hover:border-cyan-400'}
              ${file ? 'bg-gray-50 dark:bg-gray-900' : ''}
            `}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getFileIcon(file)}
                  <div className="text-left">
                    <p className="font-medium truncate max-w-[200px]">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isDragActive ? 'Drop the file here' : 'Drag & drop or click to select'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, DOC, DOCX, or images up to 10MB
                </p>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="documentType">Document Type</Label>
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the document"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={loading || !file}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {loading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
