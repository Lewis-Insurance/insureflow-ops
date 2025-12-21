/**
 * Comparison Upload Modal
 *
 * Enforces exactly 2 documents with A/B role assignment.
 * Features:
 * - Drag-drop file upload
 * - A/B role assignment with swap
 * - Document type hints
 * - Quality preview
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload,
  FileText,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle,
  Loader2,
  X,
} from "lucide-react";
import type { DocumentType } from "@/types/coverage-comparison";

interface ComparisonUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onUploadComplete?: () => void;
}

interface UploadedDocument {
  id: string;
  file: File;
  fileName: string;
  fileUrl: string;
  docRole: "A" | "B";
  documentType?: DocumentType;
  uploadProgress: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  error?: string;
}

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "dec_page", label: "Declarations Page" },
  { value: "quote", label: "Quote" },
  { value: "policy", label: "Policy" },
  { value: "endorsement", label: "Endorsement" },
  { value: "loss_run", label: "Loss Run" },
  { value: "certificate", label: "Certificate of Insurance" },
  { value: "application", label: "Application" },
  { value: "binder", label: "Binder" },
];

export function ComparisonUploadModal({
  open,
  onOpenChange,
  workspaceId,
  onUploadComplete,
}: ComparisonUploadModalProps) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Handle file drop/select
  const handleFilesSelected = useCallback(async (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files).slice(0, 2 - documents.length);

    for (const file of newFiles) {
      if (!file.type.includes("pdf") && !file.type.includes("image")) {
        toast({
          title: "Invalid file type",
          description: "Please upload PDF or image files only.",
          variant: "destructive",
        });
        continue;
      }

      const docRole = documents.length === 0 ? "A" : "B";
      const newDoc: UploadedDocument = {
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileUrl: "",
        docRole,
        uploadProgress: 0,
        status: "pending",
      };

      setDocuments((prev) => [...prev, newDoc]);
    }
  }, [documents.length, toast]);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  }, [handleFilesSelected]);

  // Remove document
  const removeDocument = useCallback((docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  // Swap roles
  const swapRoles = useCallback(() => {
    setDocuments((prev) =>
      prev.map((doc) => ({
        ...doc,
        docRole: doc.docRole === "A" ? "B" : "A",
      }))
    );
  }, []);

  // Update document type
  const updateDocumentType = useCallback((docId: string, docType: DocumentType) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === docId ? { ...doc, documentType: docType } : doc
      )
    );
  }, []);

  // Upload documents
  const uploadDocuments = async () => {
    if (documents.length !== 2) {
      toast({
        title: "Two documents required",
        description: "Please upload exactly 2 documents for comparison.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      for (const doc of documents) {
        // Update status to uploading
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id ? { ...d, status: "uploading" } : d
          )
        );

        // Upload to storage
        const filePath = `${workspaceId}/${Date.now()}_${doc.fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("workspace-documents")
          .upload(filePath, doc.file, {
            onUploadProgress: (progress) => {
              const percent = (progress.loaded / progress.total) * 100;
              setDocuments((prev) =>
                prev.map((d) =>
                  d.id === doc.id ? { ...d, uploadProgress: percent } : d
                )
              );
            },
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("workspace-documents")
          .getPublicUrl(filePath);

        // Create workspace_document record
        const { error: dbError } = await supabase
          .from("workspace_documents")
          .insert({
            workspace_id: workspaceId,
            file_name: doc.fileName,
            file_url: urlData.publicUrl,
            doc_role: doc.docRole,
            document_type: doc.documentType,
          });

        if (dbError) throw dbError;

        // Update status to uploaded
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, status: "uploaded", fileUrl: urlData.publicUrl }
              : d
          )
        );
      }

      toast({
        title: "Documents uploaded",
        description: "Both documents have been uploaded successfully.",
      });

      onUploadComplete?.();
      onOpenChange(false);
      setDocuments([]);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });

      setDocuments((prev) =>
        prev.map((d) =>
          d.status === "uploading"
            ? { ...d, status: "error", error: error.message }
            : d
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  const docA = documents.find((d) => d.docRole === "A");
  const docB = documents.find((d) => d.docRole === "B");
  const canUpload = documents.length === 2 && !isUploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents for Comparison</DialogTitle>
          <DialogDescription>
            Upload exactly 2 documents to compare. Assign them as Document A
            (left) and Document B (right).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Drop zone */}
          {documents.length < 2 && (
            <div
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors
                ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf,image/*";
                input.multiple = documents.length === 0;
                input.onchange = (e) => {
                  handleFilesSelected((e.target as HTMLInputElement).files);
                };
                input.click();
              }}
            >
              <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                PDF or image files ({2 - documents.length} more needed)
              </p>
            </div>
          )}

          {/* Document cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Document A */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  Document A
                </Badge>
                {documents.length === 2 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={swapRoles}
                    className="h-7 px-2"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {docA ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {docA.fileName}
                        </p>
                        {docA.status === "uploading" && (
                          <Progress value={docA.uploadProgress} className="h-1 mt-1" />
                        )}
                        {docA.status === "uploaded" && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Uploaded
                          </p>
                        )}
                        {docA.status === "error" && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {docA.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeDocument(docA.id)}
                      disabled={isUploading}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="mt-3">
                    <Select
                      value={docA.documentType}
                      onValueChange={(v) => updateDocumentType(docA.id, v as DocumentType)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No document</p>
                </div>
              )}
            </div>

            {/* Document B */}
            <div className="space-y-2">
              <Badge variant="outline" className="bg-orange-50 text-orange-700">
                Document B
              </Badge>

              {docB ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {docB.fileName}
                        </p>
                        {docB.status === "uploading" && (
                          <Progress value={docB.uploadProgress} className="h-1 mt-1" />
                        )}
                        {docB.status === "uploaded" && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Uploaded
                          </p>
                        )}
                        {docB.status === "error" && (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {docB.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeDocument(docB.id)}
                      disabled={isUploading}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="mt-3">
                    <Select
                      value={docB.documentType}
                      onValueChange={(v) => updateDocumentType(docB.id, v as DocumentType)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No document</p>
                </div>
              )}
            </div>
          </div>

          {/* Warning */}
          {documents.length === 2 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800">
                  Verify document assignments
                </p>
                <p className="text-amber-700 text-xs mt-1">
                  Document A will be compared against Document B. Use the swap
                  button if needed.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDocuments([]);
              onOpenChange(false);
            }}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button onClick={uploadDocuments} disabled={!canUpload}>
            {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Upload & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
