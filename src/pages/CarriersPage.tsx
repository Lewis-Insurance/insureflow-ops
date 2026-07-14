import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneForDisplay } from '@/lib/format';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Plus, Building2, Trash2, Mail, Phone, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Carrier {
  id: string;
  name: string;
  naic?: string;
  agency_code?: string;
  underwriting_contact_name?: string;
  underwriting_contact_phone?: string;
  marketing_contact_name?: string;
  marketing_contact_phone?: string;
  contact_email?: string;
  main_phone?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  created_at: string;
  updated_at: string;
}

interface CarrierFormData {
  name: string;
  naic: string;
  agency_code: string;
  underwriting_contact_name: string;
  underwriting_contact_phone: string;
  marketing_contact_name: string;
  marketing_contact_phone: string;
  contact_email: string;
  main_phone: string;
  address_line1: string;
  city: string;
  state: string;
  zip_code: string;
}

const initialFormData: CarrierFormData = {
  name: '',
  naic: '',
  agency_code: '',
  underwriting_contact_name: '',
  underwriting_contact_phone: '',
  marketing_contact_name: '',
  marketing_contact_phone: '',
  contact_email: '',
  main_phone: '',
  address_line1: '',
  city: '',
  state: '',
  zip_code: ''
};

export default function CarriersPage() {
  const [searchParams] = useSearchParams();
  const highlightCarrierId = searchParams.get('carrier');
  
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [formData, setFormData] = useState<CarrierFormData>(initialFormData);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletingCarrier, setDeletingCarrier] = useState<Carrier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: carriers, isLoading } = useQuery({
    queryKey: ['carriers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carriers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Carrier[];
    }
  });

  // Scroll to highlighted carrier
  useEffect(() => {
    if (highlightCarrierId && carriers) {
      const element = document.getElementById(`carrier-${highlightCarrierId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [highlightCarrierId, carriers]);

  const createCarrierMutation = useMutation({
    mutationFn: async (data: CarrierFormData) => {
      const { error } = await supabase
        .from('carriers')
        .insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] });
      setIsDialogOpen(false);
      setFormData(initialFormData);
      toast.success('Carrier created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create carrier: ' + error.message);
    }
  });

  const updateCarrierMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<CarrierFormData> }) => {
      const { error } = await supabase
        .from('carriers')
        .update(data.updates)
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] });
      setIsDialogOpen(false);
      setEditingCarrier(null);
      setFormData(initialFormData);
      toast.success('Carrier updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update carrier: ' + error.message);
    }
  });

  const deleteCarrierMutation = useMutation({
    mutationFn: async (carrierId: string) => {
      const { error } = await supabase
        .from('carriers')
        .delete()
        .eq('id', carrierId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] });
      setDeletingCarrier(null);
      toast.success('Carrier deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete carrier: ' + error.message);
    }
  });

  const handleEdit = (carrier: Carrier) => {
    setEditingCarrier(carrier);
    setFormData({
      name: carrier.name || '',
      naic: carrier.naic || '',
      agency_code: carrier.agency_code || '',
      underwriting_contact_name: carrier.underwriting_contact_name || '',
      underwriting_contact_phone: carrier.underwriting_contact_phone || '',
      marketing_contact_name: carrier.marketing_contact_name || '',
      marketing_contact_phone: carrier.marketing_contact_phone || '',
      contact_email: carrier.contact_email || '',
      main_phone: carrier.main_phone || '',
      address_line1: carrier.address_line1 || '',
      city: carrier.city || '',
      state: carrier.state || '',
      zip_code: carrier.zip_code || ''
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Trim the name so stray leading/trailing whitespace never breaks sorting.
    const payload = { ...formData, name: formData.name.trim() };
    if (editingCarrier) {
      updateCarrierMutation.mutate({ id: editingCarrier.id, updates: payload });
    } else {
      createCarrierMutation.mutate(payload);
    }
  };

  const handleNewCarrier = () => {
    setEditingCarrier(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleDelete = (carrier: Carrier) => {
    setDeletingCarrier(carrier);
  };

  const confirmDelete = () => {
    if (deletingCarrier) {
      deleteCarrierMutation.mutate(deletingCarrier.id);
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCarriers = (carriers ?? [])
    .filter((carrier) => {
      if (!normalizedQuery) return true;
      return [carrier.name, carrier.naic, carrier.agency_code, carrier.underwriting_contact_name]
        .some((value) => (value ?? '').toLowerCase().includes(normalizedQuery));
    })
    // Sort by name, ignoring case and any stray edge whitespace.
    .sort((a, b) =>
      (a.name ?? '').trim().localeCompare((b.name ?? '').trim(), undefined, { sensitivity: 'base' })
    );

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Carrier Management</h2>
            <p className="text-muted-foreground">
              Manage insurance carriers, NAIC numbers, and contact information
            </p>
          </div>
          <Button onClick={handleNewCarrier}>
            <Plus className="h-4 w-4 mr-2" />
            Add Carrier
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center justify-center">
                <div className="text-muted-foreground">Loading carriers...</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Insurance Carriers ({filteredCarriers.length})
                </CardTitle>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search carriers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredCarriers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>NAIC</TableHead>
                      <TableHead>Agency Code</TableHead>
                      <TableHead>Underwriting Contact</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCarriers.map((carrier) => (
                      <TableRow 
                        key={carrier.id}
                        id={`carrier-${carrier.id}`}
                        className={highlightCarrierId === carrier.id ? 'bg-accent' : ''}
                      >
                        <TableCell className="font-medium">{carrier.name}</TableCell>
                        <TableCell>{carrier.naic || 'N/A'}</TableCell>
                        <TableCell>{carrier.agency_code || 'N/A'}</TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <div className="font-medium">{carrier.underwriting_contact_name || 'N/A'}</div>
                            {carrier.underwriting_contact_phone && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {formatPhoneForDisplay(carrier.underwriting_contact_phone)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(carrier)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(carrier)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {normalizedQuery
                    ? 'No carriers match your search.'
                    : 'No carriers found. Click "Add Carrier" to get started.'}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCarrier ? 'Edit Carrier' : 'Add New Carrier'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Carrier Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="naic">NAIC Code</Label>
                  <Input
                    id="naic"
                    value={formData.naic}
                    onChange={(e) => setFormData({ ...formData, naic: e.target.value })}
                    placeholder="e.g. 25143"
                  />
                </div>
                <div>
                  <Label htmlFor="agency_code">Agency Code</Label>
                  <Input
                    id="agency_code"
                    value={formData.agency_code}
                    onChange={(e) => setFormData({ ...formData, agency_code: e.target.value })}
                  />
                </div>
              </div>

              <Tabs defaultValue="underwriting" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="underwriting">Underwriting Contact</TabsTrigger>
                  <TabsTrigger value="marketing">Marketing Rep Contact</TabsTrigger>
                </TabsList>
                
                <TabsContent value="underwriting" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="underwriting_contact_name">Contact Name</Label>
                      <Input
                        id="underwriting_contact_name"
                        value={formData.underwriting_contact_name}
                        onChange={(e) => setFormData({ ...formData, underwriting_contact_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="underwriting_contact_phone">Contact Phone</Label>
                      <Input
                        id="underwriting_contact_phone"
                        value={formData.underwriting_contact_phone}
                        onChange={(e) => setFormData({ ...formData, underwriting_contact_phone: e.target.value })}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="marketing" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="marketing_contact_name">Contact Name</Label>
                      <Input
                        id="marketing_contact_name"
                        value={formData.marketing_contact_name}
                        onChange={(e) => setFormData({ ...formData, marketing_contact_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="marketing_contact_phone">Contact Phone</Label>
                      <Input
                        id="marketing_contact_phone"
                        value={formData.marketing_contact_phone}
                        onChange={(e) => setFormData({ ...formData, marketing_contact_phone: e.target.value })}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contact_email">Contact Email</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
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
                <Label htmlFor="address_line1">Address</Label>
                <Input
                  id="address_line1"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  placeholder="Street address"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                  disabled={createCarrierMutation.isPending || updateCarrierMutation.isPending}
                >
                  {editingCarrier ? 'Update Carrier' : 'Create Carrier'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deletingCarrier} onOpenChange={() => setDeletingCarrier(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Carrier</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingCarrier?.name}"? This action cannot be undone.
                This will permanently remove the carrier from your system.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                disabled={deleteCarrierMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteCarrierMutation.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
