/**
 * Templates Settings Component
 * 
 * Manage templates for:
 * - Email Templates
 * - SMS Templates
 * - Document Templates
 * - Proposal Templates
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText,
  Mail,
  MessageSquare,
  File,
  FileSpreadsheet,
  Plus,
  Edit,
  Trash2,
  Save,
  Loader2,
  Copy,
  Eye,
  Search,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Template {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'document' | 'proposal';
  category: string;
  subject?: string;
  content: string;
  variables: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const SAMPLE_TEMPLATES: Template[] = [
  {
    id: '1',
    name: 'Welcome Email',
    type: 'email',
    category: 'Onboarding',
    subject: 'Welcome to {{company_name}}!',
    content: 'Dear {{client_name}},\n\nWelcome to {{company_name}}! We are excited to have you as a client...',
    variables: ['client_name', 'company_name', 'agent_name'],
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Renewal Reminder',
    type: 'email',
    category: 'Renewals',
    subject: 'Your policy renews on {{renewal_date}}',
    content: 'Dear {{client_name}},\n\nYour {{policy_type}} policy is coming up for renewal on {{renewal_date}}...',
    variables: ['client_name', 'policy_type', 'renewal_date', 'premium_amount'],
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Quote Follow-up',
    type: 'sms',
    category: 'Sales',
    content: 'Hi {{first_name}}, following up on the quote we sent. Any questions? Reply or call {{agent_phone}}.',
    variables: ['first_name', 'agent_phone'],
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function TemplatesSettings() {
  const [templates, setTemplates] = useState<Template[]>(SAMPLE_TEMPLATES);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('email');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const filteredTemplates = templates.filter(
    t => t.type === activeTab && 
    (searchQuery === '' || 
     t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;

    try {
      // In production, save to database
      if (editingTemplate.id) {
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? editingTemplate : t));
      } else {
        setTemplates(prev => [...prev, { ...editingTemplate, id: crypto.randomUUID() }]);
      }

      toast({
        title: 'Template Saved',
        description: `${editingTemplate.name} has been saved.`,
      });
      setIsDialogOpen(false);
      setEditingTemplate(null);
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Error',
        description: 'Failed to save template.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast({
      title: 'Template Deleted',
      description: 'The template has been removed.',
    });
  };

  const handleDuplicateTemplate = (template: Template) => {
    const duplicate = {
      ...template,
      id: crypto.randomUUID(),
      name: `${template.name} (Copy)`,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTemplates(prev => [...prev, duplicate]);
    toast({
      title: 'Template Duplicated',
      description: `Created copy of ${template.name}.`,
    });
  };

  const createNewTemplate = () => {
    setEditingTemplate({
      id: '',
      name: '',
      type: activeTab as 'email' | 'sms' | 'document' | 'proposal',
      category: '',
      subject: activeTab === 'email' ? '' : undefined,
      content: '',
      variables: [],
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <FileText className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <CardTitle>Message & Document Templates</CardTitle>
                <CardDescription>
                  Create and manage reusable templates for emails, SMS, and documents
                </CardDescription>
              </div>
            </div>
            <Button onClick={createNewTemplate}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                  <Badge variant="secondary" className="ml-1">
                    {templates.filter(t => t.type === 'email').length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="sms" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS
                  <Badge variant="secondary" className="ml-1">
                    {templates.filter(t => t.type === 'sms').length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="document" className="flex items-center gap-2">
                  <File className="h-4 w-4" />
                  Document
                  <Badge variant="secondary" className="ml-1">
                    {templates.filter(t => t.type === 'document').length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="proposal" className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Proposal
                  <Badge variant="secondary" className="ml-1">
                    {templates.filter(t => t.type === 'proposal').length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

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

            <TabsContent value={activeTab} className="mt-0">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No templates found</p>
                  <p className="text-sm">Create your first {activeTab} template to get started.</p>
                  <Button className="mt-4" onClick={createNewTemplate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Template
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      {activeTab === 'email' && <TableHead>Subject</TableHead>}
                      <TableHead>Variables</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{template.category}</Badge>
                        </TableCell>
                        {activeTab === 'email' && (
                          <TableCell className="text-muted-foreground truncate max-w-[200px]">
                            {template.subject}
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {template.variables.slice(0, 3).map((v) => (
                              <Badge key={v} variant="secondary" className="text-xs">
                                {`{{${v}}}`}
                              </Badge>
                            ))}
                            {template.variables.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{template.variables.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {template.is_default ? (
                            <Badge className="bg-green-600">Default</Badge>
                          ) : (
                            <Badge variant="outline">Custom</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingTemplate(template);
                                setIsDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDuplicateTemplate(template)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {!template.is_default && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => handleDeleteTemplate(template.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate?.id ? 'Edit Template' : 'Create Template'}
            </DialogTitle>
            <DialogDescription>
              {activeTab === 'email' ? 'Create an email template with dynamic variables.' :
               activeTab === 'sms' ? 'Create an SMS template (max 160 characters recommended).' :
               'Create a document template.'}
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    placeholder="e.g., Welcome Email"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    value={editingTemplate.category}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                    placeholder="e.g., Onboarding, Sales"
                  />
                </div>
              </div>

              {activeTab === 'email' && (
                <div className="space-y-2">
                  <Label>Subject Line</Label>
                  <Input
                    value={editingTemplate.subject || ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    placeholder="e.g., Welcome to {{company_name}}!"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                  placeholder="Enter your template content. Use {{variable_name}} for dynamic values."
                  rows={activeTab === 'sms' ? 4 : 10}
                />
                {activeTab === 'sms' && (
                  <p className="text-xs text-muted-foreground">
                    Characters: {editingTemplate.content.length} / 160 recommended
                  </p>
                )}
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <Label className="text-sm font-medium">Available Variables</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['client_name', 'first_name', 'last_name', 'email', 'phone', 'company_name', 
                    'agent_name', 'agent_phone', 'agent_email', 'policy_type', 'policy_number',
                    'premium_amount', 'renewal_date', 'expiration_date'].map((v) => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => {
                        setEditingTemplate({
                          ...editingTemplate,
                          content: editingTemplate.content + `{{${v}}}`,
                        });
                      }}
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate}>
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TemplatesSettings;

