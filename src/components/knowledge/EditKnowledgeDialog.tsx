import { useState, useEffect } from 'react';
import { Edit, RotateCcw, History, Save, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUpdateKnowledge, useKnowledgeVersions, useRestoreKnowledgeVersion } from '@/hooks/useKnowledgeEdit';
import { KnowledgeEntry } from '@/hooks/useKnowledgeBase';
import { formatDistanceToNow } from 'date-fns';

interface EditKnowledgeDialogProps {
  entry: KnowledgeEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  { value: 'policies', label: 'Insurance Policies' },
  { value: 'claims', label: 'Claims Process' },
  { value: 'products', label: 'Products & Pricing' },
  { value: 'regulations', label: 'State Regulations' },
  { value: 'procedures', label: 'Internal Procedures' },
  { value: 'faqs', label: 'Customer FAQs' },
];

export function EditKnowledgeDialog({ entry, open, onOpenChange, onSuccess }: EditKnowledgeDialogProps) {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'policies',
    tags: '',
    source: '',
    changeNotes: '',
  });

  const updateKnowledge = useUpdateKnowledge();
  const { data: versions = [], refetch: refetchVersions } = useKnowledgeVersions(entry?.id || null);
  const restoreVersion = useRestoreKnowledgeVersion();

  // Update form when entry changes
  useEffect(() => {
    if (entry) {
      setFormData({
        title: entry.title,
        content: entry.content,
        category: entry.category,
        tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : '',
        source: entry.source || '',
        changeNotes: '',
      });
    }
  }, [entry]);

  const handleSubmit = async () => {
    if (!entry) return;

    const tags = formData.tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t);

    await updateKnowledge.mutateAsync({
      id: entry.id,
      title: formData.title,
      content: formData.content,
      category: formData.category,
      tags,
      source: formData.source,
      changeNotes: formData.changeNotes,
    });

    onSuccess?.();
    refetchVersions();
  };

  const handleRestore = async (versionId: string) => {
    if (!entry) return;

    await restoreVersion.mutateAsync({
      knowledgeId: entry.id,
      versionId,
    });

    onSuccess?.();
    refetchVersions();
  };

  const handleClose = () => {
    onOpenChange(false);
    setFormData({
      title: '',
      content: '',
      category: 'policies',
      tags: '',
      source: '',
      changeNotes: '',
    });
  };

  if (!entry) return null;

  const hasChanges =
    formData.title !== entry.title ||
    formData.content !== entry.content ||
    formData.category !== entry.category ||
    formData.tags !== (Array.isArray(entry.tags) ? entry.tags.join(', ') : '') ||
    formData.source !== (entry.source || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Knowledge Entry
          </DialogTitle>
          <DialogDescription>
            Make changes to the knowledge base entry. All changes are versioned and can be rolled back.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="edit" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="edit">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Version History ({versions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Knowledge entry title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content (Markdown supported)</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter the knowledge content..."
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Input
                    id="source"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    placeholder="Source of information"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="auto, comprehensive, coverage"
                />
                {formData.tags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.tags.split(',').map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {hasChanges && (
                <div className="space-y-2">
                  <Label htmlFor="changeNotes">Change Notes (optional)</Label>
                  <Input
                    id="changeNotes"
                    value={formData.changeNotes}
                    onChange={(e) => setFormData({ ...formData, changeNotes: e.target.value })}
                    placeholder="Describe what changed and why..."
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={updateKnowledge.isPending}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!hasChanges || updateKnowledge.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateKnowledge.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {versions.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">
                    No version history available yet. Changes will be tracked after the first edit.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {versions.map((version) => (
                  <Card key={version.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-sm font-medium">
                            Version {version.version_number}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                          </CardDescription>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestore(version.id)}
                          disabled={restoreVersion.isPending}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Restore
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {version.change_notes && (
                        <div className="text-xs bg-muted p-2 rounded">
                          <strong>Notes:</strong> {version.change_notes}
                        </div>
                      )}
                      <div className="space-y-1 text-xs">
                        <div>
                          <strong>Title:</strong> {version.title}
                        </div>
                        <div>
                          <strong>Category:</strong> {version.category}
                        </div>
                        {version.tags && version.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap items-center">
                            <strong>Tags:</strong>
                            {version.tags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
