import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

interface AccountData {
  name: string;
  type: string;
  email?: string;
  phone?: string;
}

export default function CustomerEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<AccountData>({
    name: '',
    type: 'household',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    async function fetchAccount() {
      try {
        const { data: account, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          toast({
            title: 'Error',
            description: 'Failed to load customer details',
            variant: 'destructive',
          });
          navigate('/customers');
          return;
        }

        setData({
          name: account.name || '',
          type: account.type === 'commercial_business' ? 'business' : (account.type || 'household'),
          email: account.email || '',
          phone: account.phone || '',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load customer data',
          variant: 'destructive',
        });
        navigate('/customers');
      } finally {
        setLoading(false);
      }
    }

    fetchAccount();
  }, [id, navigate, toast]);

  async function handleSave() {
    if (!id || !data.name.trim()) return;
    
    setSaving(true);
    try {
        const { error } = await supabase
          .from('accounts')
          .update({
            name: data.name.trim(),
            type: data.type === 'business' ? 'commercial_business' : data.type as any,
            email: data.email?.trim() || null,
            phone: data.phone?.trim() || null,
          })
          .eq('id', id);

      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Customer updated successfully',
      });
      
      navigate(`/customers/${id}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update customer',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-8">
          <div>Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => navigate(`/customers/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold">Edit Customer</h1>
        </div>

        {/* Form */}
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={data.name}
                onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Customer name"
              />
            </div>

            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={data.type} onValueChange={(value) => setData(prev => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="household">Household</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={data.email || ''}
                onChange={(e) => setData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={data.phone || ''}
                onChange={(e) => setData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="ghost" onClick={() => navigate(`/customers/${id}`)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !data.name.trim()}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}