import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Eye,
  CheckCircle,
  XCircle,
  FileImage,
  Target,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CarrierTemplate {
  id: string;
  carrier_name: string;
  carrier_code: string | null;
  document_type: string;
  line_of_business: string | null;
  template_name: string;
  template_description: string | null;
  sample_document_thumbnail: string | null;
  page_count: number;
  times_matched: number;
  avg_extraction_confidence: number;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  field_zones_count?: number;
}

export default function CarrierTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<CarrierTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('carrier_document_templates')
        .select(`
          *,
          template_field_zones(count)
        `)
        .order('carrier_name');

      if (error) throw error;

      const templatesWithCount = (data || []).map((t: any) => ({
        ...t,
        field_zones_count: t.template_field_zones?.[0]?.count || 0,
      }));

      setTemplates(templatesWithCount);
    } catch (error: any) {
      toast({
        title: 'Error loading templates',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleActive = async (template: CarrierTemplate) => {
    try {
      const { error } = await supabase
        .from('carrier_document_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;

      setTemplates(templates.map(t =>
        t.id === template.id ? { ...t, is_active: !t.is_active } : t
      ));

      toast({
        title: template.is_active ? 'Template deactivated' : 'Template activated',
      });
    } catch (error: any) {
      toast({
        title: 'Error updating template',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('carrier_document_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTemplates(templates.filter(t => t.id !== id));
      toast({ title: 'Template deleted' });
    } catch (error: any) {
      toast({
        title: 'Error deleting template',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const duplicateTemplate = async (template: CarrierTemplate) => {
    try {
      const { data, error } = await supabase
        .from('carrier_document_templates')
        .insert({
          carrier_name: template.carrier_name,
          carrier_code: template.carrier_code,
          document_type: template.document_type,
          line_of_business: template.line_of_business,
          template_name: `${template.template_name} (Copy)`,
          template_description: template.template_description,
          page_count: template.page_count,
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Copy field zones
      const { data: zones } = await supabase
        .from('template_field_zones')
        .select('*')
        .eq('template_id', template.id);

      if (zones && zones.length > 0) {
        const newZones = zones.map(z => ({
          ...z,
          id: undefined,
          template_id: data.id,
          times_extracted: 0,
          times_corrected: 0,
          extraction_success_rate: 0,
        }));

        await supabase.from('template_field_zones').insert(newZones);
      }

      toast({ title: 'Template duplicated' });
      loadTemplates();
    } catch (error: any) {
      toast({
        title: 'Error duplicating template',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.carrier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.template_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.document_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getDocTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      dec_page: 'bg-blue-100 text-blue-800',
      application: 'bg-green-100 text-green-800',
      endorsement: 'bg-purple-100 text-purple-800',
      certificate: 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Carrier Document Templates</h1>
            <p className="text-muted-foreground">
              Create templates for carrier-specific documents to improve extraction accuracy
            </p>
          </div>
          <Button onClick={() => navigate('/carrier-templates/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileImage className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{templates.length}</p>
                  <p className="text-sm text-muted-foreground">Total Templates</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {templates.filter(t => t.is_active).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Target className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {templates.reduce((acc, t) => acc + t.times_matched, 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Matches</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {templates.length > 0
                      ? Math.round(
                          (templates.reduce((acc, t) => acc + t.avg_extraction_confidence, 0) /
                            templates.length) *
                            100
                        )
                      : 0}%
                  </p>
                  <p className="text-sm text-muted-foreground">Avg Confidence</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Templates Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Templates</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <FileImage className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No templates yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create a template by uploading a sample carrier document
                </p>
                <Button onClick={() => navigate('/carrier-templates/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Template
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Matches</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {template.sample_document_thumbnail ? (
                            <img
                              src={template.sample_document_thumbnail}
                              alt=""
                              className="w-10 h-12 object-cover rounded border"
                            />
                          ) : (
                            <div className="w-10 h-12 bg-gray-100 rounded border flex items-center justify-center">
                              <FileImage className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{template.template_name}</p>
                            {template.template_description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {template.template_description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{template.carrier_name}</p>
                          {template.carrier_code && (
                            <p className="text-xs text-muted-foreground">{template.carrier_code}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getDocTypeColor(template.document_type)}>
                          {template.document_type.replace('_', ' ')}
                        </Badge>
                        {template.line_of_business && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {template.line_of_business}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{template.field_zones_count || 0}</span>
                        <span className="text-muted-foreground"> zones</span>
                      </TableCell>
                      <TableCell>
                        {template.times_matched > 0 ? (
                          <span className="font-medium">{template.times_matched}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {template.avg_extraction_confidence > 0 ? (
                          <span
                            className={`font-medium ${
                              template.avg_extraction_confidence >= 0.9
                                ? 'text-green-600'
                                : template.avg_extraction_confidence >= 0.7
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}
                          >
                            {Math.round(template.avg_extraction_confidence * 100)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {template.is_active ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {template.is_verified && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => navigate(`/carrier-templates/${template.id}`)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate(`/carrier-templates/${template.id}/edit`)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicateTemplate(template)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive(template)}>
                              {template.is_active ? (
                                <>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteTemplate(template.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
