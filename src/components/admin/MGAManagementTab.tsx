import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, Users, Building } from 'lucide-react';
import { toast } from 'sonner';

interface MGA {
  id: string;
  name: string;
  code?: string;
  contact_info?: any;
  is_active: boolean;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  main_phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  agency_login_url?: string;
  created_at: string;
  updated_at: string;
}

interface MGAFormData {
  name: string;
  code: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  main_phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_active: boolean;
  agency_login_url: string;
}

const initialFormData: MGAFormData = {
  name: '',
  code: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  main_phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  zip_code: '',
  country: 'US',
  is_active: true,
  agency_login_url: ''
};

export function MGAManagementTab() {
  const [editingMGA, setEditingMGA] = useState<MGA | null>(null);
  const [formData, setFormData] = useState<MGAFormData>(initialFormData);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: mgas, isLoading } = useQuery({
    queryKey: ['mgas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mgas')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as MGA[];
    }
  });

  const createMGAMutation = useMutation({
    mutationFn: async (data: MGAFormData) => {
      const { error } = await supabase
        .from('mgas')
        .insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mgas'] });
      setIsDialogOpen(false);
      setFormData(initialFormData);
      toast.success('MGA created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create MGA: ' + error.message);
    }
  });

  const updateMGAMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<MGAFormData> }) => {
      const { error } = await supabase
        .from('mgas')
        .update(data.updates)
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mgas'] });
      setIsDialogOpen(false);
      setEditingMGA(null);
      setFormData(initialFormData);
      toast.success('MGA updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update MGA: ' + error.message);
    }
  });

  const handleEdit = (mga: MGA) => {
    setEditingMGA(mga);
    setFormData({
      name: mga.name || '',
      code: mga.code || '',
      contact_name: mga.contact_name || '',
      contact_email: mga.contact_email || '',
      contact_phone: mga.contact_phone || '',
      main_phone: mga.main_phone || '',
      address_line1: mga.address_line1 || '',
      address_line2: mga.address_line2 || '',
      city: mga.city || '',
      state: mga.state || '',
      zip_code: mga.zip_code || '',
      country: mga.country || 'US',
      is_active: mga.is_active,
      agency_login_url: mga.agency_login_url || ''
    });
    setIsDialogOpen(true);
  };

  const handleNewMGA = () => {
    setEditingMGA(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMGA) {
      updateMGAMutation.mutate({ id: editingMGA.id, updates: formData });
    } else {
      createMGAMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return <div>Loading MGAs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MGA Management</h2>
          <p className="text-muted-foreground">
            Manage Managing General Agents and their information
          </p>
        </div>
        <Button onClick={handleNewMGA}>
          <Plus className="h-4 w-4 mr-2" />
          Add MGA
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total MGAs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mgas?.length || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active MGAs</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mgas?.filter(mga => mga.is_active).length || 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive MGAs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mgas?.filter(mga => !mga.is_active).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Managing General Agents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mgas?.map((mga) => (
                <TableRow key={mga.id}>
                  <TableCell className="font-medium">{mga.name}</TableCell>
                  <TableCell>{mga.code || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant={mga.is_active ? 'default' : 'secondary'}>
                      {mga.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{mga.contact_name || 'N/A'}</div>
                      <div className="text-muted-foreground">{mga.contact_email || 'N/A'}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{mga.main_phone || mga.contact_phone || 'N/A'}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(mga)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMGA ? 'Edit MGA' : 'Add New MGA'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">MGA Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="code">MGA Code</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="main_phone">Main Phone</Label>
                <Input
                  id="main_phone"
                  value={formData.main_phone}
                  onChange={(e) => setFormData({ ...formData, main_phone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="agency_login_url">Agency Login URL</Label>
              <Input
                id="agency_login_url"
                type="url"
                value={formData.agency_login_url}
                onChange={(e) => setFormData({ ...formData, agency_login_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div>
              <Label htmlFor="address_line1">Address Line 1</Label>
              <Input
                id="address_line1"
                value={formData.address_line1}
                onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                placeholder="Street address"
              />
            </div>

            <div>
              <Label htmlFor="address_line2">Address Line 2</Label>
              <Input
                id="address_line2"
                value={formData.address_line2}
                onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                placeholder="Apt, suite, etc. (optional)"
              />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  maxLength={2}
                  placeholder="FL"
                />
              </div>
              <div>
                <Label htmlFor="zip_code">ZIP Code</Label>
                <Input
                  id="zip_code"
                  value={formData.zip_code}
                  onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMGAMutation.isPending || updateMGAMutation.isPending}
              >
                {editingMGA ? 'Update MGA' : 'Create MGA'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}