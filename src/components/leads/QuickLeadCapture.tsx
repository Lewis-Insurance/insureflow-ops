import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateLead } from "@/hooks/useLeads";
import { useLeadSources } from "@/integrations/supabase/hooks/useLeadSources";
import { Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { InsuranceDetailsModal } from "./InsuranceDetailsModal";
import type { InsuranceType } from "@/integrations/supabase/hooks/useLeadInsuranceDetails";

const leadSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  source_id: z.string().optional(),
  insurance_types: z.array(z.string()).optional(),
  current_carrier: z.string().optional(),
  current_premium: z.string().optional(),
  decision_timeframe: z.enum(['immediate', '30_days', '60_days', '90_days', 'no_rush']).optional(),
  notes: z.string().optional(),
});

type LeadFormValues = z.infer<typeof leadSchema>;

const INSURANCE_TYPES = [
  { value: 'auto', label: 'Auto' },
  { value: 'home', label: 'Home' },
  { value: 'life', label: 'Life' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'umbrella', label: 'Umbrella' },
  { value: 'renters', label: 'Renters' },
];

export const QuickLeadCapture = () => {
  const [open, setOpen] = useState(false);
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);
  const [activeInsuranceModal, setActiveInsuranceModal] = useState<InsuranceType | null>(null);
  const [selectedInsuranceTypes, setSelectedInsuranceTypes] = useState<string[]>([]);
  const createLead = useCreateLead();
  const { data: sources } = useLeadSources();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      insurance_types: [],
      notes: "",
    },
  });

  const onSubmit = async (data: LeadFormValues) => {
    const leadData = {
      ...data,
      current_premium: data.current_premium ? parseFloat(data.current_premium) : null,
      status: 'new' as const,
      lead_score: 50, // Default score
    };

    createLead.mutate(leadData as any, {
      onSuccess: (newLead) => {
        setCreatedLeadId(newLead.id);
        setSelectedInsuranceTypes(data.insurance_types || []);
        
        // Open first insurance modal if any types selected
        if (data.insurance_types && data.insurance_types.length > 0) {
          setActiveInsuranceModal(data.insurance_types[0] as InsuranceType);
        } else {
          // No insurance types, close immediately
          setOpen(false);
          form.reset();
          setCreatedLeadId(null);
        }
      },
    });
  };

  const handleInsuranceModalClose = () => {
    if (!createdLeadId || !selectedInsuranceTypes.length) {
      setActiveInsuranceModal(null);
      return;
    }

    // Find next insurance type to show
    const currentIndex = selectedInsuranceTypes.indexOf(activeInsuranceModal!);
    const nextIndex = currentIndex + 1;

    if (nextIndex < selectedInsuranceTypes.length) {
      // Show next insurance type modal
      setActiveInsuranceModal(selectedInsuranceTypes[nextIndex] as InsuranceType);
    } else {
      // All done, close everything
      setActiveInsuranceModal(null);
      setOpen(false);
      form.reset();
      setCreatedLeadId(null);
      setSelectedInsuranceTypes([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capture New Lead</DialogTitle>
          <DialogDescription>
            Add a new lead to your pipeline. All fields except name are optional.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
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
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} />
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
                      <Input type="email" placeholder="john@example.com" {...field} />
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
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
              render={() => (
                <FormItem>
                  <FormLabel>Insurance Needs</FormLabel>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {INSURANCE_TYPES.map((type) => (
                      <FormField
                        key={type.value}
                        control={form.control}
                        name="insurance_types"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={type.value}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(type.value)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value || []), type.value])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== type.value
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {type.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
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
                      <Input placeholder="State Farm" {...field} />
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
                    <FormLabel>Current Premium (Annual)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1200" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="decision_timeframe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Decision Timeframe</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="When do they need coverage?" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="immediate">Immediate (ASAP)</SelectItem>
                      <SelectItem value="30_days">Within 30 days</SelectItem>
                      <SelectItem value="60_days">Within 60 days</SelectItem>
                      <SelectItem value="90_days">Within 90 days</SelectItem>
                      <SelectItem value="no_rush">No rush / Just shopping</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <Textarea
                      placeholder="Additional information about this lead..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createLead.isPending}>
                {createLead.isPending ? "Creating..." : "Create Lead"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      {/* Insurance Details Modals */}
      {createdLeadId && activeInsuranceModal && (
        <InsuranceDetailsModal
          leadId={createdLeadId}
          insuranceType={activeInsuranceModal}
          isOpen={true}
          onClose={handleInsuranceModalClose}
        />
      )}
    </Dialog>
  );
};
