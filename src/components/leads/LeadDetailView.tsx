import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { AddQuoteModal } from "@/components/customers/AddQuoteModal";
import { useRankedQuotesByAccount } from "@/hooks/useQuoteScoring";
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
  FileText,
  Plus,
  TrendingUp,
  Shield,
  Car,
  Home,
  AlertTriangle,
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
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const { data: lead, isLoading } = useLead(leadId || undefined);
  const { data: sources } = useLeadSources();
  const { data: rankedQuotes } = useRankedQuotesByAccount(leadId || '');
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  // Query for Canopy data linked to this lead
  const { data: canopyPull } = useQuery({
    queryKey: ['canopy-pull-for-lead-detail', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from('canopy_pulls')
        .select(`
          id,
          status,
          policy_count,
          carrier_count,
          completed_at,
          metadata,
          canopy_policies (
            id,
            carrier_name,
            policy_type,
            policy_number,
            premium_amount,
            premium_frequency,
            status,
            effective_date,
            expiration_date,
            deductible
          )
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!leadId && open,
  });

  // Fetch vehicles for the policies
  const { data: canopyVehicles } = useQuery({
    queryKey: ['canopy-vehicles-for-lead-detail', canopyPull?.id],
    queryFn: async () => {
      if (!canopyPull?.canopy_policies?.length) return [];
      const policyIds = (canopyPull.canopy_policies as any[]).map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_vehicles')
        .select('*')
        .in('policy_id', policyIds);
      if (error) return [];
      return data;
    },
    enabled: !!canopyPull?.canopy_policies?.length,
  });

  // Fetch drivers for the policies
  const { data: canopyDrivers } = useQuery({
    queryKey: ['canopy-drivers-for-lead-detail', canopyPull?.id],
    queryFn: async () => {
      if (!canopyPull?.canopy_policies?.length) return [];
      const policyIds = (canopyPull.canopy_policies as any[]).map(p => p.id);
      const { data, error } = await supabase
        .from('canopy_drivers')
        .select('*')
        .in('policy_id', policyIds);
      if (error) return [];
      return data;
    },
    enabled: !!canopyPull?.canopy_policies?.length,
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
      estimated_effective_date: (lead).estimated_effective_date || "",
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

              {/* Canopy Imported Data */}
              {canopyPull && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-600" />
                      CANOPY IMPORTED DATA
                    </h3>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-2 bg-blue-50 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground">Policies</p>
                        <p className="text-lg font-bold text-blue-700">{canopyPull.policy_count || 0}</p>
                      </div>
                      <div className="p-2 bg-purple-50 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground">Carriers</p>
                        <p className="text-lg font-bold text-purple-700">{canopyPull.carrier_count || 0}</p>
                      </div>
                      <div className="p-2 bg-orange-50 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground">Vehicles</p>
                        <p className="text-lg font-bold text-orange-700">{canopyVehicles?.length || 0}</p>
                      </div>
                      <div className="p-2 bg-green-50 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground">Drivers</p>
                        <p className="text-lg font-bold text-green-700">{canopyDrivers?.length || 0}</p>
                      </div>
                    </div>

                    <Accordion type="multiple" className="w-full" defaultValue={["policies"]}>
                      {/* Policies Accordion */}
                      {canopyPull.canopy_policies && (canopyPull.canopy_policies as any[]).length > 0 && (
                        <AccordionItem value="policies">
                          <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-600" />
                              Policies ({(canopyPull.canopy_policies as any[]).length})
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3">
                              {(canopyPull.canopy_policies as any[]).map((policy: any) => (
                                <div key={policy.id} className="p-3 bg-muted/50 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">{policy.carrier_name}</span>
                                      <Badge variant="outline" className="text-xs capitalize">{policy.policy_type}</Badge>
                                    </div>
                                    {policy.premium_amount && (
                                      <span className="font-semibold text-sm text-green-700">
                                        ${policy.premium_amount.toLocaleString()}/{policy.premium_frequency || 'yr'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                    {policy.policy_number && (
                                      <div>Policy #: <span className="text-foreground">{policy.policy_number}</span></div>
                                    )}
                                    {policy.effective_date && (
                                      <div>Effective: <span className="text-foreground">{format(new Date(policy.effective_date), 'MM/dd/yyyy')}</span></div>
                                    )}
                                    {policy.expiration_date && (
                                      <div>Expires: <span className="text-foreground font-medium">{format(new Date(policy.expiration_date), 'MM/dd/yyyy')}</span></div>
                                    )}
                                    {policy.deductible && (
                                      <div>Deductible: <span className="text-foreground">${policy.deductible.toLocaleString()}</span></div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {/* Vehicles Accordion */}
                      {canopyVehicles && canopyVehicles.length > 0 && (
                        <AccordionItem value="vehicles">
                          <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-orange-600" />
                              Vehicles ({canopyVehicles.length})
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3">
                              {canopyVehicles.map((vehicle: any) => (
                                <div key={vehicle.id} className="p-3 bg-muted/50 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium text-sm">
                                      {vehicle.year} {vehicle.make} {vehicle.model}
                                    </span>
                                    {vehicle.ownership && (
                                      <Badge variant="outline" className="text-xs capitalize">{vehicle.ownership}</Badge>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                    {vehicle.vin && (
                                      <div>VIN: <span className="text-foreground font-mono text-xs">{vehicle.vin}</span></div>
                                    )}
                                    {vehicle.usage_type && (
                                      <div>Usage: <span className="text-foreground capitalize">{vehicle.usage_type}</span></div>
                                    )}
                                    {vehicle.annual_mileage && (
                                      <div>Annual Miles: <span className="text-foreground">{vehicle.annual_mileage.toLocaleString()}</span></div>
                                    )}
                                  </div>
                                  {/* Coverages */}
                                  {(vehicle.liability_bi || vehicle.collision_deductible) && (
                                    <div className="mt-2 pt-2 border-t border-muted">
                                      <div className="grid grid-cols-2 gap-1 text-xs">
                                        {vehicle.liability_bi && (
                                          <div className="text-muted-foreground">BI: <span className="text-foreground">${vehicle.liability_bi.toLocaleString()}</span></div>
                                        )}
                                        {vehicle.liability_pd && (
                                          <div className="text-muted-foreground">PD: <span className="text-foreground">${vehicle.liability_pd.toLocaleString()}</span></div>
                                        )}
                                        {vehicle.collision_deductible && (
                                          <div className="text-muted-foreground">Collision: <span className="text-foreground">${vehicle.collision_deductible}</span></div>
                                        )}
                                        {vehicle.comprehensive_deductible && (
                                          <div className="text-muted-foreground">Comp: <span className="text-foreground">${vehicle.comprehensive_deductible}</span></div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {/* Drivers Accordion */}
                      {canopyDrivers && canopyDrivers.length > 0 && (
                        <AccordionItem value="drivers">
                          <AccordionTrigger className="text-sm hover:no-underline">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-green-600" />
                              Drivers ({canopyDrivers.length})
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3">
                              {canopyDrivers.map((driver: any) => (
                                <div key={driver.id} className="p-3 bg-muted/50 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium text-sm">
                                      {driver.first_name} {driver.last_name}
                                    </span>
                                    <div className="flex gap-1">
                                      {driver.is_primary && (
                                        <Badge variant="default" className="text-xs">Primary</Badge>
                                      )}
                                      {driver.relation_to_insured && (
                                        <Badge variant="outline" className="text-xs capitalize">{driver.relation_to_insured}</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                    {driver.date_of_birth && (
                                      <div>DOB: <span className="text-foreground">{format(new Date(driver.date_of_birth), 'MM/dd/yyyy')}</span></div>
                                    )}
                                    {driver.gender && (
                                      <div>Gender: <span className="text-foreground capitalize">{driver.gender}</span></div>
                                    )}
                                    {driver.marital_status && (
                                      <div>Marital: <span className="text-foreground capitalize">{driver.marital_status}</span></div>
                                    )}
                                    {driver.license_state && (
                                      <div>License: <span className="text-foreground">{driver.license_state}</span></div>
                                    )}
                                  </div>
                                  {/* Violations/Accidents */}
                                  {((driver.violations && driver.violations.length > 0) || (driver.accidents && driver.accidents.length > 0)) && (
                                    <div className="mt-2 pt-2 border-t border-muted">
                                      <div className="flex items-center gap-1 text-xs text-amber-600">
                                        <AlertTriangle className="h-3 w-3" />
                                        {driver.violations?.length > 0 && <span>{driver.violations.length} violation(s)</span>}
                                        {driver.accidents?.length > 0 && <span>{driver.accidents.length} accident(s)</span>}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </div>
                </>
              )}

              <Separator />

              {/* Quotes Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    QUOTES ({rankedQuotes?.length || 0})
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddQuoteOpen(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Quote
                  </Button>
                </div>

                {rankedQuotes && rankedQuotes.length > 0 ? (
                  <div className="space-y-3">
                    {rankedQuotes.slice(0, 3).map((quote: any, index: number) => (
                      <div
                        key={quote.id}
                        className="border rounded-lg p-3 space-y-2 hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={index === 0 ? "default" : "secondary"}>
                              #{index + 1}
                            </Badge>
                            <span className="font-medium text-sm">
                              {quote.carrier || 'Unknown Carrier'}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-sm">
                              ${quote.premium?.toLocaleString() || 'N/A'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              /year
                            </div>
                          </div>
                        </div>

                        {quote.quote_score !== null && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  quote.quote_score >= 85
                                    ? 'bg-green-500'
                                    : quote.quote_score >= 70
                                    ? 'bg-blue-500'
                                    : quote.quote_score >= 55
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${quote.quote_score}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium min-w-[3ch]">
                              {quote.quote_score}
                            </span>
                          </div>
                        )}

                        {quote.line_of_business && (
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-xs">
                              {quote.line_of_business}
                            </Badge>
                          </div>
                        )}
                      </div>
                    ))}

                    {rankedQuotes.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{rankedQuotes.length - 3} more quote{rankedQuotes.length - 3 !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 border-2 border-dashed rounded-lg">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground mb-3">No quotes yet</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddQuoteOpen(true)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add First Quote
                    </Button>
                  </div>
                )}
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

      {/* Add Quote Modal */}
      {lead && (
        <AddQuoteModal
          open={addQuoteOpen}
          onOpenChange={setAddQuoteOpen}
          accountId={lead.id}
          accountName={`${lead.first_name} ${lead.last_name}`}
        />
      )}

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
