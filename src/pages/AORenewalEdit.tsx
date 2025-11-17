import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppLayout } from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, CheckSquare } from 'lucide-react';
import { useAORenewal, useUpdateAORenewal, type AORenewalStatus, type AORenewalPriority, type AORenewal } from '@/hooks/useAORenewals';
import { Skeleton } from '@/components/ui/skeleton';
import { AddAORenewalTaskModal } from '@/components/renewals/AddAORenewalTaskModal';
import { useProfiles } from '@/hooks/useProfiles';
import { AORenewalNotes } from '@/components/renewals/AORenewalNotes';
import { AORenewalContactLog } from '@/components/renewals/AORenewalContactLog';
import { AORenewalQuotes } from '@/components/renewals/AORenewalQuotes';

export default function AORenewalEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: renewal, isLoading } = useAORenewal(id);
  const updateMutation = useUpdateAORenewal();
  const { profiles } = useProfiles();
  
  const [showTaskModal, setShowTaskModal] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    policy_number: '',
    policy_type: '',
    renewal_date: '',
    current_premium: '',
    term_months: '' as '' | '6' | '12',
    status: 'pending' as AORenewalStatus,
    priority: 'normal' as AORenewalPriority,
    assigned_to: '',
    last_contact_date: '',
    losses_3yr: '',
    oldest_in_household: '',
  });

  useEffect(() => {
    if (renewal) {
      setFormData({
        customer_name: renewal.customer_name || '',
        policy_number: renewal.policy_number || '',
        policy_type: renewal.policy_type || '',
        renewal_date: renewal.renewal_date ? renewal.renewal_date.split('T')[0] : '',
        current_premium: renewal.current_premium?.toString() || '',
        term_months: renewal.term_months ? renewal.term_months.toString() as '6' | '12' : '',
        status: renewal.status || 'pending',
        priority: renewal.priority || 'normal',
        assigned_to: renewal.assigned_to || '',
        last_contact_date: renewal.last_contact_date ? renewal.last_contact_date.split('T')[0] : '',
        losses_3yr: renewal.losses_3yr?.toString() || '',
        oldest_in_household: renewal.oldest_in_household?.toString() || '',
      });
    }
  }, [renewal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!id) return;

    try {
      await updateMutation.mutateAsync({
        id,
        updates: {
          customer_name: formData.customer_name.trim(),
          policy_number: formData.policy_number.trim(),
          policy_type: formData.policy_type.trim(),
          renewal_date: formData.renewal_date,
          current_premium: parseFloat(formData.current_premium) || null,
          term_months: formData.term_months ? parseInt(formData.term_months) as 6 | 12 : null,
          status: formData.status,
          priority: formData.priority,
          assigned_to: formData.assigned_to.trim() || null,
          last_contact_date: formData.last_contact_date || null,
          losses_3yr: formData.losses_3yr ? parseInt(formData.losses_3yr) : null,
          oldest_in_household: formData.oldest_in_household ? parseInt(formData.oldest_in_household) : null,
        },
      });

      toast({
        title: 'Success',
        description: 'Renewal updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update renewal',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Card className="max-w-4xl">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!renewal) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">Renewal not found</p>
              <Button
                variant="outline"
                onClick={() => navigate('/ao-renewals')}
                className="mt-4"
              >
                Back to Renewals
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/ao-renewals')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-semibold">Edit Renewal</h1>
          </div>
          {renewal && (
            <Button variant="outline" onClick={() => setShowTaskModal(true)}>
              <CheckSquare className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle>Renewal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer_name">Customer Name *</Label>
                  <Input
                    id="customer_name"
                    value={formData.customer_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="policy_number">Policy Number *</Label>
                  <Input
                    id="policy_number"
                    value={formData.policy_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_number: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="policy_type">Policy Type</Label>
                  <Input
                    id="policy_type"
                    value={formData.policy_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_type: e.target.value }))}
                    placeholder="e.g., Personal Automobile"
                  />
                </div>

                <div>
                  <Label htmlFor="renewal_date">Renewal Date *</Label>
                  <Input
                    id="renewal_date"
                    type="date"
                    value={formData.renewal_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, renewal_date: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="current_premium">Current Premium</Label>
                  <Input
                    id="current_premium"
                    type="number"
                    step="0.01"
                    value={formData.current_premium}
                    onChange={(e) => setFormData(prev => ({ ...prev, current_premium: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="term_months">Policy Term</Label>
                  <Select
                    value={formData.term_months || "not_set"}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, term_months: value === "not_set" ? '' : value as '6' | '12' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="not_set">Not Set</SelectItem>
                      <SelectItem value="6">6 Months (Semi-Annual)</SelectItem>
                      <SelectItem value="12">12 Months (Annual)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="assigned_to">Assigned To</Label>
                  <Select
                    value={formData.assigned_to || "unassigned"}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_to: value === "unassigned" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {profiles?.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name || 'Unknown User'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as AORenewalStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="renewed">Renewed</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as AORenewalPriority }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="last_contact_date">Last Contact Date</Label>
                  <Input
                    id="last_contact_date"
                    type="date"
                    value={formData.last_contact_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_contact_date: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="losses_3yr">3 Year # of Losses</Label>
                  <Input
                    id="losses_3yr"
                    type="number"
                    min="0"
                    value={formData.losses_3yr}
                    onChange={(e) => setFormData(prev => ({ ...prev, losses_3yr: e.target.value }))}
                    placeholder="0"
                  />
                </div>

                <div>
                  <Label htmlFor="oldest_in_household">Oldest in Household</Label>
                  <Input
                    id="oldest_in_household"
                    type="number"
                    min="0"
                    max="120"
                    value={formData.oldest_in_household}
                    onChange={(e) => setFormData(prev => ({ ...prev, oldest_in_household: e.target.value }))}
                    placeholder="Age"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/ao-renewals')}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Quotes Section */}
        {renewal && (
          <AORenewalQuotes 
            renewalId={renewal.id} 
            currentPremium={renewal.current_premium}
            currentTermMonths={renewal.term_months}
          />
        )}

        {/* Contact Log Section */}
        {renewal && <AORenewalContactLog renewalId={renewal.id} />}

        {/* Notes Section */}
        {renewal && <AORenewalNotes renewalId={renewal.id} />}

        {/* Task Modal */}
        {renewal && (
          <AddAORenewalTaskModal
            open={showTaskModal}
            onOpenChange={setShowTaskModal}
            renewal={renewal}
          />
        )}
      </div>
    </AppLayout>
  );
}
