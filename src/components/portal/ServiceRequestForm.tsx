// ============================================================================
// SERVICE REQUEST FORM COMPONENT
// ============================================================================
// Create service requests
// ============================================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const { createRequest } = useServiceRequests();

  const handleSelectType = (type: ServiceRequestType) => {
    setRequestType(type);
    const typeInfo = REQUEST_TYPES.find(t => t.value === type);
    if (typeInfo) {
      setTitle(typeInfo.label);
    }
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestType) return;

    setError(null);

    try {
      const id = await createRequest.mutateAsync({
        request_type: requestType,
        request_title: title,
        request_data: { details },
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
    setTitle('');
    setDetails('');
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
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Subject</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of your request"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Details</Label>
            <Textarea
              id="details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Please provide all relevant details for your request..."
              rows={5}
              required
            />
          </div>

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
      </CardContent>
    </Card>
  );
}
