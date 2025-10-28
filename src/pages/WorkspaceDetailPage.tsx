import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useWorkspace, useWorkspaceDocuments } from "@/hooks/useWorkspaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, Calendar, User, Building, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: workspace, isLoading: loadingWorkspace } = useWorkspace(id);
  const { data: documents, isLoading: loadingDocuments } = useWorkspaceDocuments(id);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processing":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      idle: "outline",
      processing: "default",
      completed: "secondary",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  if (loadingWorkspace) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!workspace) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Workspace not found
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {getStatusIcon(workspace.status)}
              <h1 className="text-3xl font-bold">{workspace.name}</h1>
              {getStatusBadge(workspace.status)}
            </div>
            {workspace.description && (
              <p className="text-muted-foreground">{workspace.description}</p>
            )}
          </div>
        </div>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Workspace Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Task Type
                </div>
                <p className="font-medium">{workspace.task_type}</p>
              </div>

              {workspace.client_name && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building className="h-4 w-4" />
                    Client
                  </div>
                  <p className="font-medium">{workspace.client_name}</p>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Created
                </div>
                <p className="font-medium">
                  {format(new Date(workspace.created_at), "MMM d, yyyy")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(workspace.created_at), { addSuffix: true })}
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Last Updated
                </div>
                <p className="font-medium">
                  {format(new Date(workspace.updated_at), "MMM d, yyyy")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(workspace.updated_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            {workspace.notes && (
              <>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Notes</p>
                  <p className="text-sm text-muted-foreground">{workspace.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Documents and Analysis */}
        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="documents">
              Documents ({documents?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Documents</CardTitle>
                <CardDescription>
                  Documents submitted for analysis in this workspace
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingDocuments ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !documents || documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No documents found
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <FileText className="h-5 w-5 text-muted-foreground mt-1" />
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="font-medium truncate">
                              {doc.file_name || "Unnamed Document"}
                            </p>
                            {doc.role && (
                              <Badge variant="outline" className="text-xs">
                                {doc.role}
                              </Badge>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Uploaded {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline"
                            >
                              View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analysis Results</CardTitle>
                <CardDescription>
                  AI-generated insights and summaries from your documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                {workspace.status === "idle" || workspace.status === "processing" ? (
                  <div className="text-center py-8 space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">
                      {workspace.status === "idle" 
                        ? "Analysis has not started yet"
                        : "Analysis in progress..."}
                    </p>
                  </div>
                ) : workspace.status === "failed" ? (
                  <div className="text-center py-8 space-y-2">
                    <XCircle className="h-8 w-8 text-destructive mx-auto" />
                    <p className="text-muted-foreground">
                      Analysis failed. Please try again or contact support.
                    </p>
                  </div>
                ) : workspace.analysis_output ? (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <h3 className="font-semibold mb-2">Summary</h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                          {typeof workspace.analysis_output === 'object' && 
                           workspace.analysis_output !== null && 
                           'summary' in workspace.analysis_output 
                            ? String(workspace.analysis_output.summary)
                            : JSON.stringify(workspace.analysis_output, null, 2)}
                        </div>
                      </div>
                      
                      {typeof workspace.analysis_output === 'object' && 
                       workspace.analysis_output !== null && 
                       'documents' in workspace.analysis_output && 
                       Array.isArray(workspace.analysis_output.documents) && (
                        <div className="bg-muted p-4 rounded-lg">
                          <h3 className="font-semibold mb-2">Analyzed Documents</h3>
                          <ul className="list-disc list-inside space-y-1">
                            {workspace.analysis_output.documents.map((doc: any, idx: number) => (
                              <li key={idx} className="text-sm">{String(doc)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {typeof workspace.analysis_output === 'object' && 
                       workspace.analysis_output !== null && 
                       'analyzed_at' in workspace.analysis_output && (
                        <div className="text-xs text-muted-foreground">
                          Analyzed on {new Date(String(workspace.analysis_output.analyzed_at)).toLocaleString()} 
                          {'model' in workspace.analysis_output && ` using ${workspace.analysis_output.model}`}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No analysis output available yet
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
