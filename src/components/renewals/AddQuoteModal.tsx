import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateAORenewalQuote } from '@/hooks/useAORenewalQuotes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface AddQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renewalId: string;
}

const CARRIERS = [
  'Progressive',
  'Geico',
  'Nationwide',
  'State Farm',
  'Allstate',
  'Liberty Mutual',
  'Farmers',
  'Travelers',
  'USAA',
  'American Family',
  'Other'
];

const DENIAL_REASONS = [
  'High Risk Driver',
  'Credit Score',
  'Claims History',
  'Lapse in Coverage',
  'Vehicle Type',
  'Location/Territory',
  'DUI/DWI',
  'License Status',
  'Age/Experience',
  'Other'
];

export function AddQuoteModal({ open, onOpenChange, renewalId }: AddQuoteModalProps) {
  const [carrier, setCarrier] = useState('');
  const [premium, setPremium] = useState('');
  const [termMonths, setTermMonths] = useState<'6' | '12'>('6');
  const [status, setStatus] = useState<'quoted' | 'denied' | 'selected'>('quoted');
  const [denialReason, setDenialReason] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const createMutation = useCreateAORenewalQuote();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: 10485760, // 10MB
    multiple: false,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setUploadedFile(acceptedFiles[0]);
      }
    },
  });

  const uploadDocument = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${renewalId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('ao-renewal-quotes')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('ao-renewal-quotes')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!carrier || !premium) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (status === 'denied' && !denialReason) {
      toast({
        title: 'Validation Error',
        description: 'Please provide a denial reason',
        variant: 'destructive',
      });
      return;
    }

    try {
      let documentUrl: string | undefined;

      if (uploadedFile) {
        setUploading(true);
        documentUrl = await uploadDocument(uploadedFile);
      }

      await createMutation.mutateAsync({
        renewal_id: renewalId,
        carrier,
        premium: parseFloat(premium),
        term_months: parseInt(termMonths) as 6 | 12,
        status,
        denial_reason: status === 'denied' ? denialReason : undefined,
        document_url: documentUrl,
        notes: notes || undefined,
      });

      // Reset form
      setCarrier('');
      setPremium('');
      setTermMonths('6');
      setStatus('quoted');
      setDenialReason('');
      setNotes('');
      setUploadedFile(null);
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding quote:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Quote</DialogTitle>
          <DialogDescription>
            Enter quote details from another carrier
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="carrier">Carrier *</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {CARRIERS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="premium">Premium Amount *</Label>
              <Input
                id="premium"
                type="number"
                step="0.01"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <Label htmlFor="term">Term *</Label>
              <Select value={termMonths} onValueChange={(v) => setTermMonths(v as '6' | '12')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="6">6 Months</SelectItem>
                  <SelectItem value="12">12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status *</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "denied" | "quoted" | "selected")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="denied">Denied</SelectItem>
                  <SelectItem value="selected">Selected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {status === 'denied' && (
            <div>
              <Label htmlFor="denial-reason">Denial Reason *</Label>
              <Select value={denialReason} onValueChange={setDenialReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {DENIAL_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Quote Document</Label>
            {uploadedFile ? (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <FileText className="h-5 w-5 text-primary" />
                <span className="flex-1 text-sm">{uploadedFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUploadedFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                {isDragActive ? (
                  <p className="text-sm text-muted-foreground">Drop the file here...</p>
                ) : (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Drag & drop a file here, or click to select
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, JPG, PNG, DOC, DOCX (max 10MB)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about this quote..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending || uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || uploading}>
              {(createMutation.isPending || uploading) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Add Quote
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
