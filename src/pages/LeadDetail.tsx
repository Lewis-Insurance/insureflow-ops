import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLead, useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { useLeadSources } from "@/integrations/supabase/hooks/useLeadSources";
import { InsuranceDetailsPanel } from "@/components/leads/insurance/InsuranceDetailsPanel";
import { AddQuoteModal } from "@/components/customers/AddQuoteModal";
import { useRankedQuotesByAccount } from "@/hooks/useQuoteScoring";
import { CanopyDataDisplay } from "@/components/canopy/CanopyDataDisplay";
import { CanopyConnectButton } from "@/components/canopy/CanopyConnectButton";
import {
  Phone,
  Mail,
  Calendar,
  DollarSign,
  User,
  Building,
  Clock,
  Star,
  Trash2,
  Edit,
  Save,
  X,
  FileText,
  Plus,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const INSURANCE_TYPES = [
  { value: 'auto', label: 'Auto' },
  { value: 'home', label: 'Home' },
  { value: 'life', label: 'Life' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'umbrella', label: 'Umbrella' },
  { value: 'renters', label: 'Renters' },
];

const leadSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  source_id: z.string().optional(),
  insurance_types: z.array(z.string()).optional(),
  current_carrier: z.string().optional(),
  current_premium: z.string().optional(),
  estimated_effective_date: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing']),
});

type LeadFormValues = z.infer<typeof leadSchema>;

export default function LeadDetail() {
  const { id: leadId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);

  const { data: lead, isLoading } = useLead(leadId || undefined);
  const { data: sources } = useLeadSources();
  const { data: rankedQuotes } = useRankedQuotesByAccount(leadId || '');
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  // Get Canopy pull data for this lead
  const { data: canopyPull } = useQuery({
    queryKey: ['canopy-pull-for-lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from('canopy_pulls')
        .select('*')
        .eq('lead_id', leadId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!leadId,
  });

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    values: lead ? {
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email || "",
      phone: lead.phone || "",
      source_id: lead.source_id || "",
      insurance_types: lead.insurance_types || [],
      current_carrier: lead.current_carrier || "",
      current_premium: lead.current_premium?.toString() || "",
      estimated_effective_date: (lead as any).estimated_effective_date || "",
      notes: lead.notes || "",
      status: lead.status as "contacted" | "lost" | "new" | "nurturing" | "qualified" | "quoted" | "won",
    } : undefined,
  });

  const onSubmit = async (data: LeadFormValues) => {
    if (!leadId) return;

    updateLead.mutate(
      {
        id: leadId,
        ...data,
        current_premium: data.current_premium ? parseFloat(data.current_premium) : null,
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!leadId) return;

    deleteLead.mutate(leadId, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        navigate('/leads');
      },
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-yellow-100 text-yellow-800',
      qualified: 'bg-purple-100 text-purple-800',
      quoted: 'bg-orange-100 text-orange-800',
      won: 'bg-green-100 text-green-800',
      lost: 'bg-red-100 text-red-800',
      nurturing: 'bg-muted text-muted-foreground',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-muted-foreground';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Lead Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The lead you're looking for doesn't exist or has been deleted.
              </p>
              <Button onClick={() => navigate('/leads')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Leads
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {lead.first_name} {lead.last_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={getStatusColor(lead.status)}>
                {lead.status.replace('_', ' ').toUpperCase()}
              </Badge>
              <Badge variant="outline" className={getScoreColor(lead.lead_score)}>
                <Star className="h-3 w-3 mr-1" />
                Score: {lead.lead_score}
              </Badge>
              {(lead.source_details as any)?.source === 'canopy_import' && (
                <Badge variant="secondary">Canopy Import</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <CanopyConnectButton
                leadId={leadId}
                variant="outline"
                size="default"
                onComplete={() => {
                  // Refetch lead data after import
                  window.location.reload();
                }}
              />
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={form.handleSubmit(onSubmit)}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-4 w-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <Form {...form}>
                <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} type="tel" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="qualified">Qualified</SelectItem>
                            <SelectItem value="quoted">Quoted</SelectItem>
                            <SelectItem value="won">Won</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                            <SelectItem value="nurturing">Nurturing</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            ) : (
              <div className="space-y-3">
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                      {lead.email}
                    </a>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                      {lead.phone}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Created: {format(new Date(lead.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Insurance Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Insurance Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <Form {...form}>
                <form className="space-y-4">
                  <FormField
                    control={form.control}
                    name="insurance_types"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Insurance Types</FormLabel>
                        <MultiSelect
                          options={INSURANCE_TYPES}
                          selected={field.value || []}
                          onChange={field.onChange}
                          placeholder="Select types..."
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="current_carrier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Carrier</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="current_premium"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Premium</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            ) : (
              <div className="space-y-3">
                {lead.insurance_types && lead.insurance_types.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {lead.insurance_types.map((type) => (
                      <Badge key={type} variant="outline">
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Badge>
                    ))}
                  </div>
                )}
                {lead.current_carrier && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Current: {lead.current_carrier}
                    </span>
                  </div>
                )}
                {lead.current_premium && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Premium: ${lead.current_premium.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Form {...form}>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea {...field} rows={4} placeholder="Add notes about this lead..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Form>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {lead.notes || "No notes yet."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Canopy Data (if imported from Canopy) */}
      {canopyPull && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Imported Insurance Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CanopyDataDisplay pullId={canopyPull.id} />
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lead? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Quote Modal */}
      {lead && (
        <AddQuoteModal
          open={addQuoteOpen}
          onOpenChange={setAddQuoteOpen}
          accountId={lead.account_id || leadId || ''}
          accountName={`${lead.first_name} ${lead.last_name}`}
        />
      )}
    </div>
  );
}
