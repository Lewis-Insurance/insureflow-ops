import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, FileText, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface LineOfBusiness {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  { value: 'personal', label: 'Personal Lines' },
  { value: 'commercial', label: 'Commercial Lines' },
  { value: 'specialty', label: 'Specialty Lines' },
  { value: 'life_health', label: 'Life & Health' },
  { value: 'other', label: 'Other' },
];

export function LinesOfBusinessManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLOB, setEditingLOB] = useState<LineOfBusiness | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: '',
    is_active: true
  });

  const queryClient = useQueryClient();

  const { data: linesOfBusiness, isLoading } = useQuery({
    queryKey: ['lines-of-business'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lines_of_business')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as LineOfBusiness[];
    }
  });

  const createLOBMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('lines_of_business')
        .insert([data]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lines-of-business'] });
      toast({ title: "Line of business created successfully" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error creating line of business", description: error.message, variant: "destructive" });
    }
  });

  const updateLOBMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase
        .from('lines_of_business')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lines-of-business'] });
      toast({ title: "Line of business updated successfully" });
      setIsDialogOpen(false);
      setEditingLOB(null);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error updating line of business", description: error.message, variant: "destructive" });
    }
  });

  const deleteLOBMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lines_of_business')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lines-of-business'] });
      toast({ title: "Line of business deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting line of business", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      category: '',
      is_active: true
    });
  };

  const handleEdit = (lob: LineOfBusiness) => {
    setEditingLOB(lob);
    setFormData({
      name: lob.name || '',
      code: lob.code || '',
      category: lob.category || '',
      is_active: lob.is_active
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const submitData = {
      name: formData.name,
      code: formData.code || null,
      category: formData.category || null,
      is_active: formData.is_active
    };

    if (editingLOB) {
      updateLOBMutation.mutate({ id: editingLOB.id, data: submitData });
    } else {
      createLOBMutation.mutate(submitData);
    }
  };

  const handleDelete = (lob: LineOfBusiness) => {
    if (window.confirm(`Are you sure you want to delete "${lob.name}"? This may affect existing policies.`)) {
      deleteLOBMutation.mutate(lob.id);
    }
  };

  // Filter and search
  const filteredLOBs = linesOfBusiness?.filter(lob => {
    const matchesSearch = searchTerm === '' ||
      lob.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lob.code && lob.code.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = filterCategory === 'all' || lob.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  // Group by category for display
  const groupedByCategory = filteredLOBs?.reduce((acc, lob) => {
    const category = lob.category || 'uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(lob);
    return acc;
  }, {} as Record<string, LineOfBusiness[]>);

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category || 'Uncategorized';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-medium">Lines of Business</h3>
          <p className="text-sm text-muted-foreground">
            Configure policy types like Auto, Home, Commercial, Workers' Comp, etc.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingLOB(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Line of Business
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingLOB ? 'Edit Line of Business' : 'Add New Line of Business'}
              </DialogTitle>
              <DialogDescription>
                {editingLOB ? 'Update line of business information' : 'Add a new policy type'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="e.g., Personal Auto, Homeowners, Workers' Comp"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g., AUTO, HOME, WC"
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground">Short code for reports</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createLOBMutation.isPending || updateLOBMutation.isPending}>
                  {editingLOB ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
            <SelectItem value="uncategorized">Uncategorized</SelectItem>
          </SelectContent>
        </Select>
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
      ) : filteredLOBs?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No lines of business found.</p>
            <p className="text-sm mt-1">Click "Add Line of Business" to create one.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLOBs?.map((lob) => (
                <TableRow key={lob.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{lob.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {lob.code ? (
                      <Badge variant="outline" className="font-mono">
                        {lob.code}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {getCategoryLabel(lob.category || '')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={lob.is_active ? "default" : "secondary"}>
                      {lob.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(lob)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(lob)}
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
        </Card>
      )}

      {/* Summary */}
      {linesOfBusiness && linesOfBusiness.length > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Total: {linesOfBusiness.length}</span>
          <span>Active: {linesOfBusiness.filter(l => l.is_active).length}</span>
          <span>Inactive: {linesOfBusiness.filter(l => !l.is_active).length}</span>
        </div>
      )}
    </div>
  );
}
