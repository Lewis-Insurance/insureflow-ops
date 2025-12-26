// ============================================================================
// SERVICE REQUEST FORM COMPONENT
// ============================================================================
// Create service requests
// ============================================================================

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Loader2,
  CheckCircle2,
  Car,
  User,
  Home,
  HelpCircle,
  FileText,
  XCircle,
  CreditCard,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { useServiceRequests } from '@/hooks/useServiceRequests';
import type { ServiceRequestType } from '@/types/portal';

// Zod validation schema for service request
const serviceRequestSchema = z.object({
  title: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200, 'Subject too long'),
  details: z.string().trim().min(10, 'Please provide more details (at least 10 characters)').max(2000, 'Details too long (max 2000 characters)'),
});

type ServiceRequestFormValues = z.infer<typeof serviceRequestSchema>;

const REQUEST_TYPES: { value: ServiceRequestType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'add_vehicle', label: 'Add Vehicle', icon: <Car className="h-5 w-5" />, description: 'Add a new vehicle to your policy' },
  { value: 'remove_vehicle', label: 'Remove Vehicle', icon: <Car className="h-5 w-5" />, description: 'Remove a vehicle from your policy' },
  { value: 'replace_vehicle', label: 'Replace Vehicle', icon: <Car className="h-5 w-5" />, description: 'Replace an existing vehicle' },
  { value: 'add_driver', label: 'Add Driver', icon: <User className="h-5 w-5" />, description: 'Add a driver to your policy' },
  { value: 'remove_driver', label: 'Remove Driver', icon: <User className="h-5 w-5" />, description: 'Remove a driver from your policy' },
  { value: 'address_change', label: 'Address Change', icon: <Home className="h-5 w-5" />, description: 'Update your address' },
  { value: 'name_change', label: 'Name Change', icon: <User className="h-5 w-5" />, description: 'Update your name' },
  { value: 'coverage_question', label: 'Coverage Question', icon: <HelpCircle className="h-5 w-5" />, description: 'Ask about your coverage' },
  { value: 'coverage_change', label: 'Change Coverage', icon: <AlertTriangle className="h-5 w-5" />, description: 'Request a coverage change' },
  { value: 'document_request', label: 'Request Document', icon: <FileText className="h-5 w-5" />, description: 'Request a policy document' },
  { value: 'certificate_request', label: 'Request Certificate', icon: <FileText className="h-5 w-5" />, description: 'Request a certificate of insurance' },
  { value: 'cancel_policy', label: 'Cancel Policy', icon: <XCircle className="h-5 w-5" />, description: 'Request to cancel your policy' },
  { value: 'billing_question', label: 'Billing Question', icon: <CreditCard className="h-5 w-5" />, description: 'Ask about billing' },
  { value: 'general_inquiry', label: 'General Inquiry', icon: <HelpCircle className="h-5 w-5" />, description: 'General question or request' },
];

interface ServiceRequestFormProps {
  policyId?: string;
  onSuccess?: (requestId: string) => void;
}

export function ServiceRequestForm({ policyId, onSuccess }: ServiceRequestFormProps) {
  const [step, setStep] = useState<'type' | 'details' | 'success'>('type');
  const [requestType, setRequestType] = useState<ServiceRequestType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const { createRequest } = useServiceRequests();

  const form = useForm<ServiceRequestFormValues>({
    resolver: zodResolver(serviceRequestSchema),
    defaultValues: {
      title: '',
      details: '',
    },
  });

  const handleSelectType = (type: ServiceRequestType) => {
    setRequestType(type);
    const typeInfo = REQUEST_TYPES.find(t => t.value === type);
    if (typeInfo) {
      form.setValue('title', typeInfo.label);
    }
    setStep('details');
  };

  const handleFormSubmit = async (values: ServiceRequestFormValues) => {
    if (!requestType) return;

    setError(null);

    try {
      const id = await createRequest.mutateAsync({
        request_type: requestType,
        request_title: values.title,
        request_data: { details: values.details },
        policy_id: policyId,
      });

      setRequestId(id);
      setStep('success');
      onSuccess?.(id);
    } catch (err) {
      setError('Failed to submit request. Please try again.');
    }
  };

  const handleReset = () => {
    setStep('type');
    setRequestType(null);
    form.reset();
    setError(null);
    setRequestId(null);
  };

  if (step === 'success') {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Request Submitted</h3>
          <p className="text-muted-foreground mb-4">
            Your request has been submitted successfully. We'll get back to you within 1 business day.
          </p>
          {requestId && (
            <p className="text-sm text-muted-foreground mb-4">
              Reference: #{requestId.slice(0, 8).toUpperCase()}
            </p>
          )}
          <Button onClick={handleReset} variant="outline">
            Submit Another Request
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'type') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>New Service Request</CardTitle>
          <CardDescription>
            Select the type of request you'd like to make
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REQUEST_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => handleSelectType(type.value)}
                className="flex items-start gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {type.icon}
                </div>
                <div>
                  <p className="font-medium">{type.label}</p>
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedType = REQUEST_TYPES.find(t => t.value === requestType);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('type')}>
            Back
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2">
              {selectedType?.icon}
              {selectedType?.label}
            </CardTitle>
            <CardDescription>{selectedType?.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Brief description of your request"
                      maxLength={200}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Details</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Please provide all relevant details for your request..."
                      rows={5}
                      maxLength={2000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={createRequest.isPending}
            >
              {createRequest.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
