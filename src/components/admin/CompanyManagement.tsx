import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Building2, Users, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface Company {
  id: string;
  legal_name: string;
  dba?: string;
  business_type?: string;
  ein?: string;
  website?: string;
  emails?: any;
  phones?: any;
  address_legal?: any;
  address_mailing?: any;
  num_employees?: number;
  annual_revenue?: number;
  years_in_business?: number;
  created_at: string;
}

export function CompanyManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    legal_name: '',
    dba: '',
    business_type: '',
    ein: '',
    website: '',
    num_employees: '',
    annual_revenue: '',
    years_in_business: ''
  });

  const queryClient = useQueryClient();

  const { data: companies, isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Company[];
    }
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('businesses')
        .insert([data]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: "Company created successfully" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error creating company", description: error.message, variant: "destructive" });
    }
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase
        .from('businesses')
        .update(data)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: "Company updated successfully" });
      setIsDialogOpen(false);
      setEditingCompany(null);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error updating company", description: error.message, variant: "destructive" });
    }
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('businesses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: "Company deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting company", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      legal_name: '',
      dba: '',
      business_type: '',
      ein: '',
      website: '',
      num_employees: '',
      annual_revenue: '',
      years_in_business: ''
    });
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      legal_name: company.legal_name || '',
      dba: company.dba || '',
      business_type: company.business_type || '',
      ein: company.ein || '',
      website: company.website || '',
      num_employees: company.num_employees?.toString() || '',
      annual_revenue: company.annual_revenue?.toString() || '',
      years_in_business: company.years_in_business?.toString() || ''
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      legal_name: formData.legal_name,
      dba: formData.dba || null,
      business_type: formData.business_type || null,
      ein: formData.ein || null,
      website: formData.website || null,
      num_employees: formData.num_employees ? parseInt(formData.num_employees) : null,
      annual_revenue: formData.annual_revenue ? parseFloat(formData.annual_revenue) : null,
      years_in_business: formData.years_in_business ? parseInt(formData.years_in_business) : null
    };

    if (editingCompany) {
      updateCompanyMutation.mutate({ id: editingCompany.id, data: submitData });
    } else {
      createCompanyMutation.mutate(submitData);
    }
  };

  const businessTypes = [
    'MGA', 'Broker', 'Agency', 'Carrier', 'Reinsurer', 'TPA', 'Wholesaler', 'Retail', 'Other'
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Companies & MGAs</h3>
          <p className="text-sm text-muted-foreground">
            Manage all business entities in your system
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingCompany(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Company
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? 'Edit Company' : 'Add New Company'}
              </DialogTitle>
              <DialogDescription>
                {editingCompany ? 'Update company information' : 'Add a new company, MGA, broker, or other business entity'}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="legal_name">Legal Name *</Label>
                  <Input
                    id="legal_name"
                    value={formData.legal_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dba">DBA / Trade Name</Label>
                  <Input
                    id="dba"
                    value={formData.dba}
                    onChange={(e) => setFormData(prev => ({ ...prev, dba: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business_type">Business Type</Label>
                  <Select
                    value={formData.business_type}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, business_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ein">EIN</Label>
                  <Input
                    id="ein"
                    value={formData.ein}
                    onChange={(e) => setFormData(prev => ({ ...prev, ein: e.target.value }))}
                    placeholder="XX-XXXXXXX"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="num_employees">Employees</Label>
                  <Input
                    id="num_employees"
                    type="number"
                    value={formData.num_employees}
                    onChange={(e) => setFormData(prev => ({ ...prev, num_employees: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annual_revenue">Annual Revenue</Label>
                  <Input
                    id="annual_revenue"
                    type="number"
                    value={formData.annual_revenue}
                    onChange={(e) => setFormData(prev => ({ ...prev, annual_revenue: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="years_in_business">Years in Business</Label>
                  <Input
                    id="years_in_business"
                    type="number"
                    value={formData.years_in_business}
                    onChange={(e) => setFormData(prev => ({ ...prev, years_in_business: e.target.value }))}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCompanyMutation.isPending || updateCompanyMutation.isPending}>
                  {editingCompany ? 'Update' : 'Create'} Company
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
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>EIN</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies?.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{company.legal_name}</div>
                      {company.dba && (
                        <div className="text-sm text-muted-foreground">DBA: {company.dba}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {company.business_type && (
                      <Badge variant="secondary">{company.business_type}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{company.ein || '-'}</TableCell>
                  <TableCell>{company.num_employees || '-'}</TableCell>
                  <TableCell>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        <Globe className="h-4 w-4" />
                      </a>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(company)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCompanyMutation.mutate(company.id)}
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