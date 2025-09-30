import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface BusinessType {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function BusinessTypeManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<BusinessType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true
  });

  const queryClient = useQueryClient();

  const { data: businessTypes, isLoading } = useQuery({
    queryKey: ['business-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_types')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as BusinessType[];
    }
  });

  const createTypeMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('business_types')
        .insert([data]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-types'] });
      toast({ title: "Business type created successfully" });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error creating business type", description: error.message, variant: "destructive" });
    }
  });

  const updateTypeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase
        .from('business_types')
        .update(data)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-types'] });
      toast({ title: "Business type updated successfully" });
      setIsDialogOpen(false);
      setEditingType(null);
      resetForm();
    },
    onError: (error) => {
      toast({ title: "Error updating business type", description: error.message, variant: "destructive" });
    }
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('business_types')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-types'] });
      toast({ title: "Business type deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting business type", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      is_active: true
    });
  };

  const handleEdit = (type: BusinessType) => {
    setEditingType(type);
    setFormData({
      name: type.name || '',
      description: type.description || '',
      is_active: type.is_active
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      name: formData.name,
      description: formData.description || null,
      is_active: formData.is_active
    };

    if (editingType) {
      updateTypeMutation.mutate({ id: editingType.id, data: submitData });
    } else {
      createTypeMutation.mutate(submitData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Business Types</h3>
          <p className="text-sm text-muted-foreground">
            Configure business type categories for classification
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingType(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Business Type
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingType ? 'Edit Business Type' : 'Add New Business Type'}
              </DialogTitle>
              <DialogDescription>
                {editingType ? 'Update business type information' : 'Add a new business type category'}
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
                  placeholder="e.g., MGA, Broker, Agency"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description of this business type"
                  rows={3}
                />
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
                <Button type="submit" disabled={createTypeMutation.isPending || updateTypeMutation.isPending}>
                  {editingType ? 'Update' : 'Create'} Business Type
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
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businessTypes?.map((type) => (
                <TableRow key={type.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{type.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {type.description || '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={type.is_active ? "default" : "secondary"}>
                      {type.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(type.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(type)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTypeMutation.mutate(type.id)}
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