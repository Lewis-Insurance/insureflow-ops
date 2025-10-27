import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Plus, Building2, Users, Trash2, UserCheck, Briefcase } from 'lucide-react';
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
  main_phone?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  default_commission_rate?: number;
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
  main_phone: string;
  address_line1: string;
  city: string;
  state: string;
  zip_code: string;
  default_commission_rate: number;
}

const initialFormData: CarrierFormData = {
  name: '',
  naic: '',
  agency_code: '',
  underwriting_contact_name: '',
  underwriting_contact_phone: '',
  marketing_contact_name: '',
  marketing_contact_phone: '',
  main_phone: '',
  address_line1: '',
  city: '',
  state: '',
  zip_code: '',
  default_commission_rate: 0.10
};

export function CarrierManagementTab() {
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [formData, setFormData] = useState<CarrierFormData>(initialFormData);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletingCarrier, setDeletingCarrier] = useState<Carrier | null>(null);
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
      main_phone: carrier.main_phone || '',
      address_line1: carrier.address_line1 || '',
      city: carrier.city || '',
      state: carrier.state || '',
      zip_code: carrier.zip_code || '',
      default_commission_rate: carrier.default_commission_rate || 0.10
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCarrier) {
      updateCarrierMutation.mutate({ id: editingCarrier.id, updates: formData });
    } else {
      createCarrierMutation.mutate(formData);
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

  if (isLoading) {
    return <div>Loading carriers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Carrier Management</h2>
          <p className="text-muted-foreground">
            Manage insurance carriers, commission rates, and contact information
          </p>
        </div>
        <Button onClick={handleNewCarrier}>
          <Plus className="h-4 w-4 mr-2" />
          Add Carrier
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Insurance Carriers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>NAIC</TableHead>
                <TableHead>Agency Code</TableHead>
                <TableHead>Commission Rate</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carriers?.map((carrier) => (
                <TableRow key={carrier.id}>
                  <TableCell className="font-medium">{carrier.name}</TableCell>
                  <TableCell>{carrier.naic || 'N/A'}</TableCell>
                  <TableCell>{carrier.agency_code || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {((carrier.default_commission_rate || 0) * 100).toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">Underwriting:</div>
                      <div>{carrier.underwriting_contact_name || 'N/A'}</div>
                      <div className="text-muted-foreground">{carrier.underwriting_contact_phone || 'N/A'}</div>
                      <div className="font-medium mt-2">Marketing:</div>
                      <div>{carrier.marketing_contact_name || 'N/A'}</div>
                      <div className="text-muted-foreground">{carrier.marketing_contact_phone || 'N/A'}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
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
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCarrier ? 'Edit Carrier' : 'Add New Carrier'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Carrier Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="naic">NAIC Code</Label>
                <Input
                  id="naic"
                  value={formData.naic}
                  onChange={(e) => setFormData({ ...formData, naic: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="agency_code">Agency Code</Label>
                <Input
                  id="agency_code"
                  value={formData.agency_code}
                  onChange={(e) => setFormData({ ...formData, agency_code: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="default_commission_rate">Default Commission Rate</Label>
                <Input
                  id="default_commission_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formData.default_commission_rate}
                  onChange={(e) => setFormData({ ...formData, default_commission_rate: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-sm text-muted-foreground">Enter as decimal (0.10 = 10%)</p>
              </div>
            </div>

            <Tabs defaultValue="underwriting" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="underwriting" className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Underwriting Contact
                </TabsTrigger>
                <TabsTrigger value="marketing" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Marketing Rep Contact
                </TabsTrigger>
              </TabsList>

              <TabsContent value="underwriting" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="underwriting_contact_name">Contact Name</Label>
                    <Input
                      id="underwriting_contact_name"
                      value={formData.underwriting_contact_name}
                      onChange={(e) => setFormData({ ...formData, underwriting_contact_name: e.target.value })}
                      placeholder="Underwriting contact name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="underwriting_contact_phone">Contact Phone</Label>
                    <Input
                      id="underwriting_contact_phone"
                      value={formData.underwriting_contact_phone}
                      onChange={(e) => setFormData({ ...formData, underwriting_contact_phone: e.target.value })}
                      placeholder="(555) 555-5555"
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
                      placeholder="Marketing rep name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="marketing_contact_phone">Contact Phone</Label>
                    <Input
                      id="marketing_contact_phone"
                      value={formData.marketing_contact_phone}
                      onChange={(e) => setFormData({ ...formData, marketing_contact_phone: e.target.value })}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 gap-4">
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

      {/* Delete Confirmation Dialog */}
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
  );
}