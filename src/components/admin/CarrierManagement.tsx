import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatPhoneForDisplay } from '@/lib/format';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Shield, Phone, Mail, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface Carrier {
  id: string;
  name: string;
  naic?: string;
  agency_code?: string;
  main_phone?: string;
  claims_phone?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  agency_login_url?: string;
  billing_portal_url?: string;
  created_at: string;
}

export function CarrierManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    naic: '',
    agency_code: '',
    main_phone: '',
    claims_phone: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'US',
    agency_login_url: '',
    billing_portal_url: ''
  });

  const queryClient = useQueryClient();

  const { data: carriers, isLoading } = useQuery({
    queryKey: ['carriers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carriers')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as Carrier[];
    }
  });

  const createCarrierMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('carriers')
        .insert([data]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] });
      toast({ title: "Carrier created successfully" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error creating carrier", description: error.message, variant: "destructive" });
    }
  });

  const updateCarrierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase
        .from('carriers')
        .update(data)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] });
      toast({ title: "Carrier updated successfully" });
      setIsDialogOpen(false);
      setEditingCarrier(null);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error updating carrier", description: error.message, variant: "destructive" });
    }
  });

  const deleteCarrierMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('carriers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] });
      toast({ title: "Carrier deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting carrier", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      naic: '',
      agency_code: '',
      main_phone: '',
      claims_phone: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      zip_code: '',
      country: 'US',
      agency_login_url: '',
      billing_portal_url: ''
    });
  };

  const handleEdit = (carrier: Carrier) => {
    setEditingCarrier(carrier);
    setFormData({
      name: carrier.name || '',
      naic: carrier.naic || '',
      agency_code: carrier.agency_code || '',
      main_phone: carrier.main_phone || '',
      claims_phone: carrier.claims_phone || '',
      contact_name: carrier.contact_name || '',
      contact_email: carrier.contact_email || '',
      contact_phone: carrier.contact_phone || '',
      address_line1: carrier.address_line1 || '',
      address_line2: carrier.address_line2 || '',
      city: carrier.city || '',
      state: carrier.state || '',
      zip_code: carrier.zip_code || '',
      country: carrier.country || 'US',
      agency_login_url: carrier.agency_login_url || '',
      billing_portal_url: carrier.billing_portal_url || ''
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      naic: formData.naic || null,
      agency_code: formData.agency_code || null,
      main_phone: formData.main_phone || null,
      claims_phone: formData.claims_phone || null,
      contact_name: formData.contact_name || null,
      contact_email: formData.contact_email || null,
      contact_phone: formData.contact_phone || null,
      address_line1: formData.address_line1 || null,
      address_line2: formData.address_line2 || null,
      city: formData.city || null,
      state: formData.state || null,
      zip_code: formData.zip_code || null,
      agency_login_url: formData.agency_login_url || null,
      billing_portal_url: formData.billing_portal_url || null
    };

    if (editingCarrier) {
      updateCarrierMutation.mutate({ id: editingCarrier.id, data: submitData });
    } else {
      createCarrierMutation.mutate(submitData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Insurance Carriers</h3>
          <p className="text-sm text-muted-foreground">
            Manage insurance carrier information and contacts
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingCarrier(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Carrier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCarrier ? 'Edit Carrier' : 'Add New Carrier'}
              </DialogTitle>
              <DialogDescription>
                {editingCarrier ? 'Update carrier information' : 'Add a new insurance carrier to the system'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Carrier Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="naic">NAIC Code</Label>
                  <Input
                    id="naic"
                    value={formData.naic}
                    onChange={(e) => setFormData(prev => ({ ...prev, naic: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agency_code">Agency Code</Label>
                  <Input
                    id="agency_code"
                    value={formData.agency_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, agency_code: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="main_phone">Main Phone</Label>
                  <Input
                    id="main_phone"
                    value={formData.main_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, main_phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="claims_phone">Claims Phone</Label>
                  <Input
                    id="claims_phone"
                    value={formData.claims_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, claims_phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Contact Information</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_name">Contact Name</Label>
                    <Input
                      id="contact_name"
                      value={formData.contact_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Contact Email</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_phone">Contact Phone</Label>
                    <Input
                      id="contact_phone"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Address</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="address_line1">Address Line 1</Label>
                    <Input
                      id="address_line1"
                      value={formData.address_line1}
                      onChange={(e) => setFormData(prev => ({ ...prev, address_line1: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address_line2">Address Line 2</Label>
                    <Input
                      id="address_line2"
                      value={formData.address_line2}
                      onChange={(e) => setFormData(prev => ({ ...prev, address_line2: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip_code">ZIP Code</Label>
                    <Input
                      id="zip_code"
                      value={formData.zip_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, zip_code: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Portal URLs</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agency_login_url">Agency Login URL</Label>
                    <Input
                      id="agency_login_url"
                      type="url"
                      value={formData.agency_login_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, agency_login_url: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing_portal_url">Billing Portal URL</Label>
                    <Input
                      id="billing_portal_url"
                      type="url"
                      value={formData.billing_portal_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_portal_url: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCarrierMutation.isPending || updateCarrierMutation.isPending}>
                  {editingCarrier ? 'Update' : 'Create'} Carrier
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carrier</TableHead>
                <TableHead>NAIC</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carriers?.map((carrier) => (
                <TableRow key={carrier.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{carrier.name}</div>
                        {carrier.agency_code && (
                          <div className="text-sm text-muted-foreground">Code: {carrier.agency_code}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{carrier.naic || '-'}</TableCell>
                  <TableCell>
                    {carrier.contact_name ? (
                      <div>
                        <div className="font-medium">{carrier.contact_name}</div>
                        {carrier.contact_email && (
                          <div className="text-sm text-muted-foreground">{carrier.contact_email}</div>
                        )}
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {carrier.main_phone && (
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3" />
                          {formatPhoneForDisplay(carrier.main_phone)}
                        </div>
                      )}
                      {carrier.claims_phone && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          Claims: {formatPhoneForDisplay(carrier.claims_phone)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {carrier.city && carrier.state ? `${carrier.city}, ${carrier.state}` : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(carrier)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCarrierMutation.mutate(carrier.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}