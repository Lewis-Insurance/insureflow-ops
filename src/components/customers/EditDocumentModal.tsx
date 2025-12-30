import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface Document {
  id: string;
  name: string | null;
  filename: string | null;
  category: string | null;
  kind: string | null;
}

interface EditDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
  onSuccess?: () => void;
}

const documentCategories = [
  { value: 'application', label: 'Application' },
  { value: 'policy', label: 'Policy Document' },
  { value: 'dec_page', label: 'Dec Page' },
  { value: 'claim', label: 'Claim Document' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'id', label: 'ID / License' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other' },
];

export function EditDocumentModal({
  open,
  onOpenChange,
  document,
  onSuccess,
}: EditDocumentModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Populate form when document changes
  useEffect(() => {
    if (document) {
      setName(document.name || document.filename || '');
      setCategory(document.category || document.kind || 'other');
    }
  }, [document]);

  const handleSave = async () => {
    if (!document) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('documents')
        .update({
          name: name.trim() || null,
          category: category,
        })
        .eq('id', document.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Document updated successfully',
      });

      // Invalidate queries to refresh the documents list
      queryClient.invalidateQueries({ queryKey: ['documents'] });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update document',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="doc-name">Document Name</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter document name"
            />
            <p className="text-xs text-muted-foreground">
              This is the display name shown in the documents list
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {documentCategories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
