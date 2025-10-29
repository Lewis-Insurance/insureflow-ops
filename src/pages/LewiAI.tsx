import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, FileSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CustomerCombobox } from "@/components/ui/customer-combobox";

export default function LewiAIPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [taskType, setTaskType] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [policies, setPolicies] = useState<Array<{ id: string; policy_number: string }>>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [selectedPolicy, setSelectedPolicy] = useState<string>("");

  // Fetch policies for selected customer
  useEffect(() => {
    if (!selectedCustomer) {
      setPolicies([]);
      setSelectedPolicy("");
      return;
    }

    const fetchPolicies = async () => {
      const { data, error } = await supabase
        .from("policies")
        .select("id, policy_number")
        .eq("account_id", selectedCustomer)
        .order("policy_number");
      
      if (!error && data) {
        setPolicies(data);
      }
    };
    fetchPolicies();
  }, [selectedCustomer]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(Array.from(e.target.files));
  };

  const createWorkspace = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one document to analyze.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create workspace record first
      const { data: session } = await supabase.auth.getSession();
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .insert({
          name: taskType === "policy_explore" ? "Policy Explore" : "Coverage Comparison",
          task_type: taskType,
          notes: notes || null,
          customer_id: selectedCustomer || null,
          policy_id: selectedPolicy || null,
          created_by: session.session?.user.id,
          status: "idle",
        })
        .select()
        .single();

      if (workspaceError) throw workspaceError;

      const workspaceId = workspace.id;
      console.log("Created workspace:", workspaceId);

      // Step 2: Upload files to Supabase storage and send URLs to Make webhook
      const MAKE_WEBHOOK_URL = "https://hook.us2.make.com/ksoxnvvls2vogx41d1se9qrunwhil2b6";
      const MAKE_API_KEY = "08031996";

      for (const file of files) {
        // Upload file to Supabase storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${workspaceId}/${Date.now()}_${file.name}`;
        
        console.log(`Uploading ${file.name} to Supabase storage...`);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('workspace-documents')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`Failed to upload ${file.name} to storage: ${uploadError.message}`);
        }

        // Get public URL for the file (bucket is public, no auth needed)
        const { data: { publicUrl } } = supabase.storage
          .from('workspace-documents')
          .getPublicUrl(fileName);

        console.log(`File: ${file.name}`);
        console.log(`Public URL being sent: ${publicUrl}`);

        // Send file URL to Make webhook - Make.com will download the binary file
        const response = await fetch(MAKE_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "x-make-apikey": MAKE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: workspaceId,
            task_type: taskType || "policy_explore",
            role: "input",
            file: {
              name: file.name,
              mime: file.type,
              url: publicUrl,
            },
            notes: notes || null,
            customer_id: selectedCustomer || null,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to send ${file.name} to Make webhook`);
        }

        console.log(`Successfully processed ${file.name}`);
      }

      toast({
        title: "Workspace created",
        description: "Your documents are being analyzed.",
      });

      navigate(`/workspace/${workspaceId}`);
    } catch (error) {
      console.error("Error creating workspace:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create workspace",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type: string) => {
    setTaskType(type);
    setShowModal(true);
    setFiles([]);
    setNotes("");
    setSelectedCustomer("");
    setSelectedPolicy("");
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">Lewi AI</h1>
          <p className="text-muted-foreground">AI-powered document analysis and comparison</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-border bg-card"
            onClick={() => openModal("coverage_comparison")}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Coverage Comparison</CardTitle>
                  <CardDescription className="mt-1">
                    Compare coverage details between multiple quote or policy options
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-border bg-card"
            onClick={() => openModal("policy_explore")}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <FileSearch className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <CardTitle className="text-xl">Explore a Policy</CardTitle>
                  <CardDescription className="mt-1">
                    Ask Lewi questions about a policy, quote, or binder document
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="capitalize">
                {taskType?.replace("_", " ")}
              </DialogTitle>
              <DialogDescription>
                Upload documents and provide any additional context for Lewi's analysis.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer / Insured</Label>
                <CustomerCombobox 
                  value={selectedCustomer}
                  onChange={setSelectedCustomer}
                  placeholder="Select a customer (optional)"
                />
              </div>

              {selectedCustomer && (
                <div className="space-y-2">
                  <Label htmlFor="policy">Policy</Label>
                  <Select value={selectedPolicy} onValueChange={setSelectedPolicy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a policy (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {policies.map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.policy_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="files">Documents</Label>
                <Input
                  id="files"
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx"
                />
                {files.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {files.length} file{files.length > 1 ? "s" : ""} selected
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes for Lewi (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any specific instructions or context for the analysis..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={createWorkspace} disabled={loading}>
                {loading ? "Creating..." : "Create Workspace"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
