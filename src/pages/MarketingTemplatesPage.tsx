import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useEmailTemplates,
  useSmsTemplates,
  useCreateEmailTemplate,
  useCreateSmsTemplate,
  useArchiveEmailTemplate,
  useDuplicateEmailTemplate,
  type TemplateCategory,
} from '@/hooks/useMarketingTemplates';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  Mail,
  MessageSquare,
  Search,
  MoreVertical,
  Copy,
  Eye,
  Archive,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  general: 'General',
  renewal: 'Renewal',
  birthday: 'Birthday',
  holiday: 'Holiday',
  welcome: 'Welcome',
  cross_sell: 'Cross-Sell',
  retention: 'Retention',
  survey: 'Survey',
  review_request: 'Review Request',
  educational: 'Educational',
  newsletter: 'Newsletter',
  referral: 'Referral',
  policy_update: 'Policy Update',
};

export default function MarketingTemplatesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('email');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    category: 'general' as TemplateCategory,
    subject: '',
    body_html: '',
    sms_message: '',
  });

  const { data: emailTemplates, isLoading: emailLoading } = useEmailTemplates({
    category: filterCategory !== 'all' ? (filterCategory as TemplateCategory) : undefined,
  });
  const { data: smsTemplates, isLoading: smsLoading } = useSmsTemplates();

  const createEmailTemplate = useCreateEmailTemplate();
  const createSmsTemplate = useCreateSmsTemplate();
  const archiveEmailTemplate = useArchiveEmailTemplate();
  const duplicateEmailTemplate = useDuplicateEmailTemplate();

  const filteredEmailTemplates = emailTemplates?.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSmsTemplates = smsTemplates?.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTemplate = async () => {
    try {
      if (activeTab === 'email') {
        await createEmailTemplate.mutateAsync({
          name: newTemplate.name,
          category: newTemplate.category,
          subject: newTemplate.subject,
          body_html: newTemplate.body_html,
        });
      } else {
        await createSmsTemplate.mutateAsync({
          name: newTemplate.name,
          category: newTemplate.category,
          message_text: newTemplate.sms_message,
        });
      }
      setShowCreateDialog(false);
      setNewTemplate({
        name: '',
        category: 'general',
        subject: '',
        body_html: '',
        sms_message: '',
      });
    } catch (error) {
      // Toast handled by hook
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveEmailTemplate.mutateAsync(id);
    } catch (error) {
      // Toast handled by hook
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateEmailTemplate.mutateAsync(id);
    } catch (error) {
      // Toast handled by hook
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Marketing Templates</h1>
            <p className="text-muted-foreground">
              Email and SMS templates for your marketing automations
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="email" className="gap-2">
                <Mail className="h-4 w-4" />
                Email Templates
                <Badge variant="secondary" className="ml-1">
                  {emailTemplates?.length || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="sms" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS Templates
                <Badge variant="secondary" className="ml-1">
                  {smsTemplates?.length || 0}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[250px]"
                />
              </div>
              {activeTab === 'email' && (
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Email Templates */}
          <TabsContent value="email" className="mt-6">
            {emailLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4" />
                      <div className="h-4 bg-muted rounded w-full" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : filteredEmailTemplates?.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Mail className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No email templates yet</h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    Create email templates for birthday greetings, renewal reminders, and more.
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Email Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredEmailTemplates?.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                          <CardDescription className="line-clamp-1">
                            {template.current_version?.subject || 'No subject'}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {template.ai_certified && (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Certified
                            </Badge>
                          )}
                          <Badge variant={template.is_active ? 'default' : 'secondary'}>
                            {template.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{CATEGORY_LABELS[template.category]}</Badge>
                        <Badge variant="outline" className="capitalize">
                          {template.message_classification}
                        </Badge>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-center p-2 bg-muted rounded-lg">
                          <div className="font-semibold">{template.times_used || 0}</div>
                          <div className="text-xs text-muted-foreground">Times Used</div>
                        </div>
                        <div className="text-center p-2 bg-muted rounded-lg">
                          <div className="font-semibold">
                            v{template.current_version?.version_number || 1}
                          </div>
                          <div className="text-xs text-muted-foreground">Version</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => toast({ title: 'Coming Soon', description: 'Template editor coming soon' })}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toast({ title: 'Coming Soon', description: 'Preview coming soon' })}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDuplicate(template.id)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleArchive(template.id)}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* SMS Templates */}
          <TabsContent value="sms" className="mt-6">
            {smsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader>
                      <div className="h-6 bg-muted rounded w-3/4" />
                      <div className="h-4 bg-muted rounded w-full" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : filteredSmsTemplates?.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No SMS templates yet</h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                    Create SMS templates for quick reminders and notifications.
                  </p>
                  <Button onClick={() => { setActiveTab('sms'); setShowCreateDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create SMS Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredSmsTemplates?.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                          <CardDescription className="line-clamp-2">
                            {template.current_version?.message_text || 'No message'}
                          </CardDescription>
                        </div>
                        <Badge variant={template.is_active ? 'default' : 'secondary'}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Character/Segment Info */}
                      {template.current_version && (
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{template.current_version.character_count} chars</span>
                          <span>{template.current_version.segment_count} segment(s)</span>
                          {template.current_version.contains_unicode && (
                            <Badge variant="outline" className="text-xs">Unicode</Badge>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => toast({ title: 'Coming Soon', description: 'Template editor coming soon' })}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toast({ title: 'Coming Soon', description: 'Preview coming soon' })}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Create {activeTab === 'email' ? 'Email' : 'SMS'} Template
            </DialogTitle>
            <DialogDescription>
              Create a new template for your marketing automations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="e.g., Birthday Greeting"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={newTemplate.category}
                  onValueChange={(value) =>
                    setNewTemplate({ ...newTemplate, category: value as TemplateCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {activeTab === 'email' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                    placeholder="e.g., Happy Birthday, {{first_name}}!"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">Email Body (HTML)</Label>
                  <Textarea
                    id="body"
                    value={newTemplate.body_html}
                    onChange={(e) => setNewTemplate({ ...newTemplate, body_html: e.target.value })}
                    placeholder="<p>Dear {{first_name}},</p><p>Happy Birthday from all of us!</p>"
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use merge fields like {'{{first_name}}'}, {'{{last_name}}'}, {'{{policy_number}}'}, etc.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="sms">SMS Message</Label>
                <Textarea
                  id="sms"
                  value={newTemplate.sms_message}
                  onChange={(e) => setNewTemplate({ ...newTemplate, sms_message: e.target.value })}
                  placeholder="Happy Birthday {{first_name}}! Your friends at {{agency_name}} wish you a great day."
                  className="min-h-[100px]"
                  maxLength={320}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Use merge fields like {'{{first_name}}'}</span>
                  <span>{newTemplate.sms_message.length}/320 characters</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={
                !newTemplate.name ||
                (activeTab === 'email' && (!newTemplate.subject || !newTemplate.body_html)) ||
                (activeTab === 'sms' && !newTemplate.sms_message)
              }
            >
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
