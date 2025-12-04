import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, Save, X } from "lucide-react";
import { useUpdateKnowledge, useKnowledgeHistory } from "@/hooks/useKnowledgeEditor";
import type { KnowledgeEntry } from "@/hooks/useKnowledgeBase";
import { KnowledgeVersionHistory } from "./KnowledgeVersionHistory";

interface KnowledgeEditorDialogProps {
  entry: KnowledgeEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CATEGORIES = [
  { value: "policies", label: "Insurance Policies" },
  { value: "claims", label: "Claims Process" },
  { value: "products", label: "Products & Pricing" },
  { value: "regulations", label: "State Regulations" },
  { value: "procedures", label: "Internal Procedures" },
  { value: "faqs", label: "Customer FAQs" },
];

export function KnowledgeEditorDialog({
  entry,
  open,
  onOpenChange,
  onSuccess,
}: KnowledgeEditorDialogProps) {
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "faqs",
    tags: "",
    changeSummary: "",
  });

  const [hasChanges, setHasChanges] = useState(false);
  const updateKnowledge = useUpdateKnowledge();
  const { data: history } = useKnowledgeHistory(entry?.id || null);

  // Initialize form when entry changes
  useEffect(() => {
    if (entry) {
      setFormData({
        title: entry.title,
        content: entry.content,
        category: entry.category,
        tags: Array.isArray(entry.tags) ? entry.tags.join(", ") : "",
        changeSummary: "",
      });
      setHasChanges(false);
    }
  }, [entry]);

  // Track if form has changes
  useEffect(() => {
    if (!entry) return;

    const changed =
      formData.title !== entry.title ||
      formData.content !== entry.content ||
      formData.category !== entry.category ||
      formData.tags !== (Array.isArray(entry.tags) ? entry.tags.join(", ") : "");

    setHasChanges(changed);
  }, [formData, entry]);

  const handleSave = () => {
    if (!entry || !hasChanges) return;

    updateKnowledge.mutate(
      {
        id: entry.id,
        title: formData.title,
        content: formData.content,
        category: formData.category,
        tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
        changeSummary: formData.changeSummary || "Updated knowledge entry",
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      }
    );
  };

  const handleCancel = () => {
    if (hasChanges) {
      const confirm = window.confirm(
        "You have unsaved changes. Are you sure you want to close?"
      );
      if (!confirm) return;
    }
    onOpenChange(false);
  };

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Knowledge Entry</DialogTitle>
          <DialogDescription>
            Update this knowledge entry. Changes will be tracked in version history.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="edit" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="edit">
              <Save className="h-4 w-4 mr-2" />
              Edit
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Version History ({history?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-4 pt-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter knowledge title"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
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

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="Comma-separated tags (e.g., auto, commercial, california)"
              />
              {formData.tags && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((tag, i) => (
                      <Badge key={i} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Enter knowledge content (supports markdown)"
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Supports Markdown formatting. {formData.content.length} characters
              </p>
            </div>

            {/* Change Summary */}
            {hasChanges && (
              <div className="space-y-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <Label htmlFor="changeSummary" className="text-yellow-900">
                  Change Summary (Optional)
                </Label>
                <Input
                  id="changeSummary"
                  value={formData.changeSummary}
                  onChange={(e) =>
                    setFormData({ ...formData, changeSummary: e.target.value })
                  }
                  placeholder="Briefly describe what you changed..."
                  className="bg-white"
                />
                <p className="text-xs text-yellow-700">
                  This will be recorded in version history
                </p>
              </div>
            )}

            {/* Metadata Display */}
            <div className="pt-4 border-t">
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">Created:</span>{" "}
                  {new Date(entry.created_at).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Last Updated:</span>{" "}
                  {new Date(entry.updated_at).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Source:</span> {entry.source}
                </div>
                <div>
                  <span className="font-medium">Versions:</span> {history?.length || 1}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            <KnowledgeVersionHistory knowledgeId={entry.id} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateKnowledge.isPending}
          >
            {updateKnowledge.isPending ? (
              "Saving..."
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
