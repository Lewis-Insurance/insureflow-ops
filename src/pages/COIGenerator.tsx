import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useCOI } from '@/hooks/useCOI';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, FileText, Download, Send, Sparkles } from 'lucide-react';

export default function COIGenerator() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { cois, createCOI, updateCOI } = useCOI(ticketId);
  
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    certificate_holder_name: '',
    certificate_holder_address: '',
    effective_date: '',
    expiration_date: '',
    coverage_details: {
      general_liability: '',
      auto_liability: '',
      workers_comp: '',
      umbrella: '',
    },
    additional_insureds: false,
    waiver_of_subrogation: false,
    special_provisions: '',
  });

  useEffect(() => {
    if (!ticketId) return;
    
    const fetchTicket = async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          accounts(id, name, address_line1, city, state, zip_code),
          policies(id, carrier, policy_number, effective_date, expiration_date)
        `)
        .eq('id', ticketId)
        .single();

      if (error) {
        toast({ title: 'Error loading ticket', description: error.message, variant: 'destructive' });
        return;
      }
      setTicket(data);
    };

    fetchTicket();
  }, [ticketId, toast]);

  const handleGenerateWithAI = async () => {
    setLoading(true);
    try {
      // TODO: Call AI edge function to generate COI data
      toast({ 
        title: 'AI Generation', 
        description: 'AI COI generation will be implemented with edge function',
      });
    } catch (error: any) {
      toast({ title: 'Failed to generate', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!ticketId || !ticket) return;
    
    try {
      await createCOI({
        ticket_id: ticketId,
        account_id: ticket.account_id,
        certificate_holder_name: formData.certificate_holder_name,
        certificate_holder_address: { text: formData.certificate_holder_address },
        effective_date: formData.effective_date,
        expiration_date: formData.expiration_date,
        coverage_details: formData.coverage_details,
        additional_insureds: formData.additional_insureds ? ['Holder as additional insured'] : [],
        special_provisions: formData.special_provisions,
        status: 'draft',
      });
    } catch (error: any) {
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    }
  };

  const handleGeneratePDF = async () => {
    toast({ 
      title: 'PDF Generation', 
      description: 'PDF generation will be implemented with edge function',
    });
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate(`/tickets/${ticketId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Ticket
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Certificate of Insurance Generator</h1>
              <p className="text-muted-foreground">
                {ticket?.accounts?.name || 'Loading...'}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleGenerateWithAI} disabled={loading}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate with AI
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Certificate Holder Information</CardTitle>
                <CardDescription>Who is requesting the certificate?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="holder-name">Holder Name *</Label>
                  <Input
                    id="holder-name"
                    value={formData.certificate_holder_name}
                    onChange={(e) => setFormData({ ...formData, certificate_holder_name: e.target.value })}
                    placeholder="Company or Individual Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="holder-address">Holder Address *</Label>
                  <Textarea
                    id="holder-address"
                    value={formData.certificate_holder_address}
                    onChange={(e) => setFormData({ ...formData, certificate_holder_address: e.target.value })}
                    placeholder="Full mailing address"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Coverage Details</CardTitle>
                <CardDescription>Enter policy coverage amounts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="effective-date">Effective Date *</Label>
                    <Input
                      id="effective-date"
                      type="date"
                      value={formData.effective_date}
                      onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiration-date">Expiration Date *</Label>
                    <Input
                      id="expiration-date"
                      type="date"
                      value={formData.expiration_date}
                      onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gl">General Liability</Label>
                  <Input
                    id="gl"
                    value={formData.coverage_details.general_liability}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, general_liability: e.target.value }
                    })}
                    placeholder="e.g., $1,000,000 per occurrence"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auto">Auto Liability</Label>
                  <Input
                    id="auto"
                    value={formData.coverage_details.auto_liability}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, auto_liability: e.target.value }
                    })}
                    placeholder="e.g., $1,000,000 combined single limit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wc">Workers Compensation</Label>
                  <Input
                    id="wc"
                    value={formData.coverage_details.workers_comp}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, workers_comp: e.target.value }
                    })}
                    placeholder="e.g., Statutory limits"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="umbrella">Umbrella/Excess</Label>
                  <Input
                    id="umbrella"
                    value={formData.coverage_details.umbrella}
                    onChange={(e) => setFormData({
                      ...formData,
                      coverage_details: { ...formData.coverage_details, umbrella: e.target.value }
                    })}
                    placeholder="e.g., $2,000,000"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Additional Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="additional-insured">Certificate Holder as Additional Insured</Label>
                  <Switch
                    id="additional-insured"
                    checked={formData.additional_insureds}
                    onCheckedChange={(checked) => setFormData({ ...formData, additional_insureds: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="waiver">Waiver of Subrogation</Label>
                  <Switch
                    id="waiver"
                    checked={formData.waiver_of_subrogation}
                    onCheckedChange={(checked) => setFormData({ ...formData, waiver_of_subrogation: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provisions">Special Provisions</Label>
                  <Textarea
                    id="provisions"
                    value={formData.special_provisions}
                    onChange={(e) => setFormData({ ...formData, special_provisions: e.target.value })}
                    placeholder="Any special terms or conditions..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleSaveDraft} className="w-full" variant="outline">
                  Save as Draft
                </Button>
                <Button onClick={handleGeneratePDF} className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate PDF
                </Button>
                <Button className="w-full" variant="secondary" disabled>
                  <Send className="h-4 w-4 mr-2" />
                  Send to Customer
                </Button>
              </CardContent>
            </Card>

            {cois.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Previous COIs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cois.map((coi) => (
                    <div key={coi.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm">{coi.certificate_number}</span>
                        <Badge variant={coi.status === 'draft' ? 'outline' : 'default'}>
                          {coi.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{coi.certificate_holder_name}</p>
                      {coi.document_url && (
                        <Button size="sm" variant="link" className="p-0 h-auto mt-2">
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}