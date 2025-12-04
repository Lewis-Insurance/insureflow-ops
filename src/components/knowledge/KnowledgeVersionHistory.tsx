import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useKnowledgeHistory, useRevertKnowledge } from "@/hooks/useKnowledgeEditor";
import { History, RotateCcw, Eye, AlertCircle, User, Clock } from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

interface KnowledgeVersionHistoryProps {
  knowledgeId: string;
}

export function KnowledgeVersionHistory({ knowledgeId }: KnowledgeVersionHistoryProps) {
  const { data: history, isLoading, error } = useKnowledgeHistory(knowledgeId);
  const revertKnowledge = useRevertKnowledge();

  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load version history: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Alert>
        <History className="h-4 w-4" />
        <AlertDescription>No version history available yet.</AlertDescription>
      </Alert>
    );
  }

  const handleRevert = (version: number) => {
    const confirm = window.confirm(
      `Are you sure you want to revert to version ${version}? This will create a new version with the old content.`
    );

    if (!confirm) return;

    revertKnowledge.mutate({ knowledgeId, version });
  };

  const handlePreview = (versionData: any) => {
    setSelectedVersion(versionData);
    setShowPreviewDialog(true);
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case "created":
        return "bg-green-100 text-green-800";
      case "updated":
        return "bg-blue-100 text-blue-800";
      case "deleted":
        return "bg-red-100 text-red-800";
      case "restored":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case "created":
        return "+";
      case "updated":
        return "✎";
      case "deleted":
        return "×";
      case "restored":
        return "↺";
      default:
        return "·";
    }
  };

  return (
    <>
      <div className="space-y-3">
        {history.map((version, index) => {
          const isLatest = index === 0;
          const changedFields = version.field_changes
            ? Object.keys(version.field_changes).length
            : 0;

          return (
            <div
              key={version.id}
              className={`p-4 border rounded-lg ${
                isLatest ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  {/* Version Header */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      v{version.version}
                    </Badge>
                    <Badge className={getChangeTypeColor(version.change_type)}>
                      {getChangeTypeIcon(version.change_type)} {version.change_type}
                    </Badge>
                    {isLatest && (
                      <Badge variant="default">Current</Badge>
                    )}
                  </div>

                  {/* Change Summary */}
                  {version.change_summary && (
                    <div className="text-sm font-medium">{version.change_summary}</div>
                  )}

                  {/* Changed Fields */}
                  {changedFields > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {changedFields} field{changedFields > 1 ? "s" : ""} changed:{" "}
                      {Object.keys(version.field_changes).join(", ")}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(version.changed_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    {version.changed_by_user && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{version.changed_by_user.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreview(version)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {!isLatest && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevert(version.version)}
                      disabled={revertKnowledge.isPending}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Revert
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Version {selectedVersion?.version} Preview
            </DialogTitle>
            <DialogDescription>
              Snapshot of this knowledge entry at this version
            </DialogDescription>
          </DialogHeader>

          {selectedVersion && (
            <div className="space-y-4">
              {/* Title */}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Title
                </div>
                <div className="text-lg font-semibold">
                  {selectedVersion.title_snapshot}
                </div>
              </div>

              {/* Category & Tags */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Category
                  </div>
                  <Badge variant="outline">
                    {selectedVersion.category_snapshot}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedVersion.tags_snapshot?.map((tag: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  Content
                </div>
                <div className="p-3 bg-muted rounded-lg whitespace-pre-wrap text-sm">
                  {selectedVersion.content_snapshot}
                </div>
              </div>

              {/* Field Changes (if any) */}
              {selectedVersion.field_changes &&
                Object.keys(selectedVersion.field_changes).length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      Changes in this version
                    </div>
                    <div className="space-y-2">
                      {Object.entries(selectedVersion.field_changes).map(
                        ([field, change]: [string, any]) => (
                          <div
                            key={field}
                            className="p-2 border rounded-lg bg-yellow-50"
                          >
                            <div className="font-medium text-sm capitalize mb-1">
                              {field}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <div className="text-red-600 font-medium">Before:</div>
                                <div className="text-red-800">
                                  {typeof change.before === "object"
                                    ? JSON.stringify(change.before)
                                    : change.before}
                                </div>
                              </div>
                              <div>
                                <div className="text-green-600 font-medium">After:</div>
                                <div className="text-green-800">
                                  {typeof change.after === "object"
                                    ? JSON.stringify(change.after)
                                    : change.after}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
