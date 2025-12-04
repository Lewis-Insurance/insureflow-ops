import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { InsuranceDetailsPanel } from "./insurance/InsuranceDetailsPanel";
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
  Edit2,
  X,
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

interface LeadDetailViewProps {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LeadDetailView = ({ leadId, open, onOpenChange }: LeadDetailViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { data: lead, isLoading } = useLead(leadId || undefined);
  const { data: sources } = useLeadSources();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

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
      estimated_effective_date: (lead).estimated_effective_date || "",
      notes: lead.notes || "",
      status: lead.status,
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
        onOpenChange(false);
      },
    });
  };

  if (isLoading || !lead) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <Separator />
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const getStatusColor = (status: string) => {
    const colors = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-yellow-100 text-yellow-800',
      qualified: 'bg-purple-100 text-purple-800',
      quoted: 'bg-orange-100 text-orange-800',
      won: 'bg-green-100 text-green-800',
      lost: 'bg-red-100 text-red-800',
      nurturing: 'bg-muted text-muted-foreground',
    };
    return colors[status as keyof typeof colors] || 'bg-muted text-muted-foreground';
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-muted-foreground';
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-2xl">
                  {lead.first_name} {lead.last_name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-2">
                  <Badge className={getStatusColor(lead.status)}>
                    {lead.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className={getScoreColor(lead.lead_score)}>
                    <Star className="h-3 w-3 mr-1" />
                    Score: {lead.lead_score}
                  </Badge>
                </SheetDescription>
              </div>
              <div className="flex gap-2">
                {!isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsEditing(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          <Separator className="my-6" />

          {!isEditing ? (
            <div className="space-y-6">
              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">
                  CONTACT INFORMATION
                </h3>
                <div className="space-y-3">
                  {lead.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {lead.email}
                        </a>
                      </div>
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Phone</p>
                        <a
                          href={`tel:${lead.phone}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {lead.phone}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Lead Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">
                  LEAD DETAILS
                </h3>
                <div className="space-y-3">
                  {lead.source && (
                    <div className="flex items-center gap-3">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Source</p>
                        <p className="text-sm text-muted-foreground">
                          {lead.source.name} ({lead.source.type})
                        </p>
                      </div>
                    </div>
                  )}
                  {lead.assigned && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={lead.assigned.avatar_url} />
                          <AvatarFallback>
                            {lead.assigned.full_name?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">Assigned To</p>
                          <p className="text-sm text-muted-foreground">
                            {lead.assigned.full_name}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Created</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(lead.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                  {lead.last_contact_at && (
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Last Contact</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(lead.last_contact_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Insurance Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground">
                  INSURANCE INFORMATION
                </h3>
                <div className="space-y-3">
                  {lead.insurance_types && lead.insurance_types.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Insurance Needs</p>
                      <div className="flex flex-wrap gap-2">
                        {lead.insurance_types.map((need) => (
                          <Badge key={need} variant="secondary">
                            {need}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {lead.current_carrier && (
                    <div>
                      <p className="text-sm font-medium">Current Carrier</p>
                      <p className="text-sm text-muted-foreground">
                        {lead.current_carrier}
                      </p>
                    </div>
                  )}
                  {lead.current_premium && (
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Current Premium</p>
                        <p className="text-sm text-muted-foreground">
                          ${lead.current_premium.toLocaleString()}/year
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {lead.notes && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground">
                      NOTES
                    </h3>
                    <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
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
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
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

                <FormField
                  control={form.control}
                  name="source_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Source</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sources?.map((source) => (
                            <SelectItem key={source.id} value={source.id}>
                              {source.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="insurance_types"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Insurance Needs</FormLabel>
                      <FormControl>
                        <MultiSelect
                          options={INSURANCE_TYPES}
                          selected={field.value || []}
                          onChange={field.onChange}
                          placeholder="Select insurance types"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
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
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>


                <FormField
                  control={form.control}
                  name="estimated_effective_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Effective Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateLead.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    {updateLead.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* Insurance Details Section */}
          {!isEditing && lead && lead.insurance_types && lead.insurance_types.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <InsuranceDetailsPanel 
                leadId={lead.id} 
                insuranceTypes={lead.insurance_types}
              />
            </div>
          )}

          {/* Action Buttons at Bottom */}
          {!isEditing && (
            <div className="flex gap-2 pt-4 border-t mt-6">
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="flex-1"
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit Lead
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this lead. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLead.isPending ? "Deleting..." : "Delete Lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
