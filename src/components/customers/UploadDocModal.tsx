import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UploadDocModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}

export function UploadDocModal({ open, onOpenChange, accountId }: UploadDocModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleUpload() {
    if (!file) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to upload documents',
          variant: 'destructive',
        });
        return;
      }

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${accountId}/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('customer-docs')
        .upload(filePath, file);

      if (uploadError) {
        toast({
          title: 'Upload Error',
          description: uploadError.message,
          variant: 'destructive',
        });
        return;
      }

      // Create document record
      const { error: dbError } = await supabase.from('documents').insert({
        account_id: accountId,
        uploaded_by: user.id,
        storage_path: filePath,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        kind: 'customer_document'
      });

      if (dbError) {
        // Clean up uploaded file if DB insert fails
        await supabase.storage.from('customer-docs').remove([filePath]);
        toast({
          title: 'Database Error',
          description: dbError.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });
      
      setFile(null);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to upload document',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="file">Select File</Label>
            <Input 
              id="file"
              type="file" 
              onChange={(e) => setFile(e.target.files?.[0] || null)} 
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            />
            {file && (
              <p className="text-sm text-muted-foreground mt-1">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={loading || !file}>
              {loading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}