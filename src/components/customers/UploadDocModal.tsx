import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { usePoliciesByAccount } from '@/hooks/usePoliciesByAccount';
import { useQuotesByAccount } from '@/hooks/useQuotes';
import { useAutoClassifyDocument, useAutoRouteDocument } from '@/hooks/useDocumentClassification';

interface UploadDocModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  policyId?: string;
  onSuccess?: () => void;
  /**
   * Called with the new documents.id after a successful upload (before
   * onSuccess). Lets callers chain document-scoped work, e.g. policy-detail
   * extraction on PolicyDetail. Optional and non-breaking.
   */
  onUploaded?: (documentId: string, associatedPolicyId: string | null) => void | Promise<void>;
}

export function UploadDocModal({ open, onOpenChange, accountId, policyId, onSuccess, onUploaded }: UploadDocModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [associationType, setAssociationType] = useState<'none' | 'policy' | 'quote'>(policyId ? 'policy' : 'none');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(policyId || '');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [noteContent, setNoteContent] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: policies, isLoading: policiesLoading } = usePoliciesByAccount(accountId);
  const { data: quotes, isLoading: quotesLoading } = useQuotesByAccount(accountId);
  const classifyDocument = useAutoClassifyDocument();
  const routeDocument = useAutoRouteDocument();

  // Reset form when modal closes
  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setDocumentName('');
      setAssociationType(policyId ? 'policy' : 'none');
      setSelectedPolicyId(policyId || '');
      setSelectedQuoteId('');
      setNoteContent('');
      setCreateTask(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
    }
  }, [open, policyId]);

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
        .from('documents')
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
      const documentData = {
        account_id: accountId,
        uploaded_by: user.id,
        storage_path: filePath,
        // Some readers (extract-wc-policy) resolve the file via file_path; keep
        // both in sync so freshly uploaded docs are extractable (review fix).
        file_path: filePath,
        storage_bucket: 'documents',
        file_missing: false,
        filename: file.name,
        name: documentName || file.name,
        mime_type: file.type,
        size_bytes: file.size,
        kind: 'customer_document' as const,
        ...(associationType === 'policy' && selectedPolicyId ? { policy_id: selectedPolicyId } : {}),
      };

      const { data: document, error: dbError } = await supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single();

      if (dbError) {
        // Clean up uploaded file if DB insert fails
        await supabase.storage.from('documents').remove([filePath]);
        toast({
          title: 'Database Error',
          description: dbError.message,
          variant: 'destructive',
        });
        return;
      }

      // Create note if provided
      if (noteContent.trim()) {
        const { error: noteError } = await supabase.from('customer_notes').insert({
          customer_id: accountId,
          note_text: noteContent,
          created_by: user.id,
          source: 'document',
        } as any);

        if (noteError) {
          console.error('Failed to create note:', noteError);
        }
      }

      // Create task if requested
      if (createTask && taskTitle.trim()) {
        const { error: taskError } = await supabase.from('tasks').insert({
          account_id: accountId,
          title: taskTitle,
          description: taskDescription || undefined,
          due_at: taskDueDate || undefined,
          status: 'pending' as const,
          priority: 'medium' as const,
        });

        if (taskError) {
          console.error('Failed to create task:', taskError);
        }
      }

      // Auto-classify and route document (silent - no interruption)
      if (document?.id) {
        try {
          // Classify the document
          const classificationResult = await classifyDocument.mutateAsync({
            documentId: document.id,
            fileName: file.name,
          });

          // If classification successful and urgency is high, auto-route
          if (classificationResult && ['immediate', 'high'].includes(classificationResult.urgency_level)) {
            await routeDocument.mutateAsync({ documentId: document.id });
          }
        } catch (error) {
          // Silent fail - don't interrupt user flow
          console.error('Auto-classification/routing failed:', error);
        }
      }

      // Chain document-scoped follow-up work (e.g. policy-detail extraction).
      if (document?.id && onUploaded) {
        try {
          await onUploaded(
            document.id,
            associationType === 'policy' && selectedPolicyId ? selectedPolicyId : null,
          );
        } catch (error) {
          console.error('onUploaded follow-up failed:', error);
        }
      }

      // Invalidate document queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['documents'], refetchType: 'all' });

      toast({
        title: 'Success',
        description: 'Document uploaded successfully',
      });

      // Call onSuccess and wait for it to complete (it may be async for refetching)
      await onSuccess?.();
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Review fix: closing mid-upload let the in-flight upload finish while
        // the caller's armed follow-up (e.g. extraction) was already disarmed.
        if (!nextOpen && loading) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* File Selection */}
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

          {/* Document Name */}
          <div>
            <Label htmlFor="documentName">Document Name (Optional)</Label>
            <Input 
              id="documentName"
              type="text" 
              placeholder={file ? file.name : "Enter document name"}
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
            />
          </div>

          {/* Association Type */}
          <div>
            <Label>Associate with</Label>
            <Select value={associationType} onValueChange={(value: 'none' | 'policy' | 'quote') => setAssociationType(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose association" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Policy Selection */}
          {associationType === 'policy' && (
            <div>
              <Label>Select Policy</Label>
              {policiesLoading ? (
                <div className="text-sm text-muted-foreground">Loading policies...</div>
              ) : (
                <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {policies?.map((policy) => (
                      <SelectItem key={policy.id} value={policy.id}>
                        {policy.policy_number} - {policy.carrier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Quote Selection */}
          {associationType === 'quote' && (
            <div>
              <Label>Select Quote</Label>
              {quotesLoading ? (
                <div className="text-sm text-muted-foreground">Loading quotes...</div>
              ) : (
                <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a quote" />
                  </SelectTrigger>
                  <SelectContent>
                    {quotes?.map((quote) => (
                      <SelectItem key={quote.id} value={quote.id}>
                        {quote.quote_ref || `Quote ${quote.id.slice(0, 8)}`} - {quote.carrier_info?.name || 'Unknown Carrier'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Note */}
          <div>
            <Label htmlFor="noteContent">Add Note (Optional)</Label>
            <Textarea 
              id="noteContent"
              placeholder="Add a note about this document..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={3}
            />
          </div>

          {/* Task Creation */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="createTask"
                checked={createTask}
                onChange={(e) => setCreateTask(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="createTask">Create a task for this document</Label>
            </div>
            
            {createTask && (
              <div className="space-y-3 pl-6">
                <div>
                  <Label htmlFor="taskTitle">Task Title</Label>
                  <Input 
                    id="taskTitle"
                    type="text" 
                    placeholder="Review document..."
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="taskDescription">Task Description (Optional)</Label>
                  <Textarea 
                    id="taskDescription"
                    placeholder="Task details..."
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                
                <div>
                  <Label htmlFor="taskDueDate">Due Date (Optional)</Label>
                  <Input 
                    id="taskDueDate"
                    type="date" 
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={loading || !file}>
              {loading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}