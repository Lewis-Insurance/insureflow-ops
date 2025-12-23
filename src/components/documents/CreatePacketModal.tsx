/**
 * Create Packet Modal
 * 
 * Modal for creating a new document collection packet.
 * Allows selecting templates or custom requirements.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  Link2,
  Mail,
} from 'lucide-react';
import { useCollectionTemplates, useCreateCollectionPacket } from '@/hooks/useDocumentCollection';
import { useToast } from '@/hooks/use-toast';
// =============================================================================
// DOC TYPES (inline to avoid config import issues)
// =============================================================================

const docTypes = [
  { value: 'ACORD_125', label: 'ACORD 125', description: 'Commercial insurance application' },
  { value: 'ACORD_126', label: 'ACORD 126', description: 'Commercial general liability section' },
  { value: 'LOSS_RUNS', label: 'Loss Runs', description: '3-5 years of loss history' },
  { value: 'PAYMENT_DOC', label: 'Payment Documentation', description: 'Down payment proof' },
  { value: 'CURRENT_DEC', label: 'Current Dec Page', description: 'Current policy declarations' },
  { value: 'RENEWAL_DEC', label: 'Renewal Dec Page', description: 'Renewal declarations' },
  { value: 'DRIVER_LIST_MVR', label: 'Driver List/MVR', description: 'Driver information and MVRs' },
  { value: 'VEHICLE_SCHEDULE', label: 'Vehicle Schedule', description: 'List of vehicles' },
  { value: 'ENTITY_DOCS', label: 'Entity Documents', description: 'Business formation docs' },
  { value: 'CERTIFICATE_REQUEST', label: 'Certificate Request', description: 'COI request form' },
  { value: 'PROPERTY_SOV', label: 'Property SOV', description: 'Statement of values' },
  { value: 'WC_MOD_PAYROLL', label: 'WC Mod/Payroll', description: 'Workers comp info' },
  { value: 'ID_CARDS', label: 'ID Cards', description: 'Insurance ID cards' },
  { value: 'SIGNED_APP', label: 'Signed Application', description: 'Signed application' },
  { value: 'PRIOR_POLICY', label: 'Prior Policy', description: 'Previous policy docs' },
  { value: 'PHOTOS', label: 'Photos', description: 'Property/vehicle photos' },
  { value: 'OTHER', label: 'Other', description: 'Other documents' },
];

interface Requirement {
  id: string;
  doc_type: string;
  label: string;
  instructions?: string;
  is_required: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

interface CreatePacketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  policyId?: string;
}

export function CreatePacketModal({ 
  open, 
  onOpenChange, 
  accountId,
  policyId,
}: CreatePacketModalProps) {
  const { toast } = useToast();
  const { data: templates = [] } = useCollectionTemplates();
  const createPacket = useCreateCollectionPacket();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [expiresDays, setExpiresDays] = useState(30);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [tab, setTab] = useState<'template' | 'custom'>('template');
  
  // Result state
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setName('');
    setDescription('');
    setRecipientEmail('');
    setRecipientName('');
    setExpiresDays(30);
    setSelectedTemplateId(null);
    setRequirements([]);
    setPortalUrl(null);
    setCopied(false);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setRequirements(
        template.requirements.map((r, i) => ({
          id: `req-${i}`,
          doc_type: r.doc_type,
          label: r.label,
          instructions: r.instructions,
          is_required: r.is_required ?? true,
        }))
      );
    }
  };

  const addRequirement = () => {
    setRequirements([
      ...requirements,
      {
        id: `req-${Date.now()}`,
        doc_type: 'other',
        label: 'New Requirement',
        is_required: true,
      },
    ]);
  };

  const updateRequirement = (id: string, updates: Partial<Requirement>) => {
    setRequirements(requirements.map(r => 
      r.id === id ? { ...r, ...updates } : r
    ));
  };

  const removeRequirement = (id: string) => {
    setRequirements(requirements.filter(r => r.id !== id));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for this collection packet.',
        variant: 'destructive',
      });
      return;
    }

    if (requirements.length === 0) {
      toast({
        title: 'Requirements Required',
        description: 'Please add at least one document requirement.',
        variant: 'destructive',
      });
      return;
    }

    const result = await createPacket.mutateAsync({
      account_id: accountId,
      policy_id: policyId,
      name,
      description: description || undefined,
      template_id: selectedTemplateId || undefined,
      requirements: requirements.map(r => ({
        doc_type: r.doc_type,
        label: r.label,
        instructions: r.instructions,
        is_required: r.is_required,
      })),
      recipient_email: recipientEmail || undefined,
      recipient_name: recipientName || undefined,
      expires_days: expiresDays,
    });

    if (result.portal_url) {
      setPortalUrl(result.portal_url);
    } else {
      onOpenChange(false);
      resetForm();
    }
  };

  const handleCopyLink = async () => {
    if (portalUrl) {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  // Show success state with portal link
  if (portalUrl) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              Packet Created
            </DialogTitle>
            <DialogDescription>
              Share this link with your client to collect documents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                value={portalUrl}
                readOnly
                className="flex-1 font-mono text-sm"
              />
              <Button onClick={handleCopyLink} variant="outline" size="icon">
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => window.open(`mailto:${recipientEmail}?subject=Document Request&body=Please upload your documents here: ${portalUrl}`)}
              >
                <Mail className="h-4 w-4 mr-2" />
                Open in Email
              </Button>
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => window.open(portalUrl, '_blank')}
              >
                <Link2 className="h-4 w-4 mr-2" />
                Preview Portal
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Document Collection Packet</DialogTitle>
          <DialogDescription>
            Request documents from your client via a secure portal link.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'template' | 'custom')} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template">Use Template</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 pr-4 mt-4">
            <div className="space-y-4 pb-4">
              {/* Packet Name & Description */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Packet Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Commercial Submission Docs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires">Link Expires</Label>
                  <Select value={String(expiresDays)} onValueChange={(v) => setExpiresDays(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Internal notes about this collection request..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <Separator />

              {/* Recipient Info */}
              <div className="space-y-2">
                <Label>Send Link To (optional)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Client email"
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                  />
                  <Input
                    placeholder="Client name"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              {/* Template Selection or Custom Requirements */}
              <TabsContent value="template" className="m-0 space-y-4">
                <div className="space-y-2">
                  <Label>Select Template</Label>
                  <Select 
                    value={selectedTemplateId || ''} 
                    onValueChange={handleTemplateSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {requirements.length > 0 && (
                  <div className="space-y-2">
                    <Label>Requirements from Template</Label>
                    <div className="space-y-2">
                      {requirements.map(req => (
                        <div 
                          key={req.id}
                          className="flex items-center gap-3 p-2 rounded border bg-muted/50"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm">{req.label}</span>
                          {req.is_required && (
                            <span className="text-xs text-red-500">Required</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="custom" className="m-0 space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Document Requirements</Label>
                  <Button variant="outline" size="sm" onClick={addRequirement}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Requirement
                  </Button>
                </div>

                <div className="space-y-3">
                  {requirements.map((req, index) => (
                    <div 
                      key={req.id}
                      className="p-3 rounded-lg border bg-card space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Select 
                              value={req.doc_type} 
                              onValueChange={(v) => updateRequirement(req.id, { 
                                doc_type: v,
                                label: docTypes.find(d => d.value === v)?.label || req.label,
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {docTypes.map(type => (
                                  <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Display label"
                              value={req.label}
                              onChange={(e) => updateRequirement(req.id, { label: e.target.value })}
                            />
                          </div>
                          <Input
                            placeholder="Instructions for client (optional)"
                            value={req.instructions || ''}
                            onChange={(e) => updateRequirement(req.id, { instructions: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`required-${req.id}`}
                              checked={req.is_required}
                              onCheckedChange={(checked) => 
                                updateRequirement(req.id, { is_required: !!checked })
                              }
                            />
                            <Label htmlFor={`required-${req.id}`} className="text-sm">
                              Required
                            </Label>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRequirement(req.id)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {requirements.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No requirements added yet</p>
                      <Button 
                        variant="link" 
                        size="sm"
                        onClick={addRequirement}
                      >
                        Add your first requirement
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={createPacket.isPending}
          >
            {createPacket.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Packet'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

