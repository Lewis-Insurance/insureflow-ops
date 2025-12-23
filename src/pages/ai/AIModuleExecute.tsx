/**
 * AI Module Execute Page
 * 
 * Generic execution page that works for ANY AI module based on its config.
 * Dynamically renders:
 * - Document upload zones with custom labels
 * - Additional input fields from config
 * - Account/Lead/Policy linker
 * - Results display
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ArrowLeft,
  Upload,
  FileText,
  X,
  Loader2,
  Sparkles,
  Link2,
  Check,
  ChevronsUpDown,
  Scale,
  Search,
  FileCheck,
  FileSearch,
  FileDigit,
  Brain,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  useAIModule,
  useExecuteModule,
  AIModuleInputConfig,
} from '@/integrations/supabase/hooks/useAIModules';
import { AIResultsDisplay } from '@/components/ai/AIResultsDisplay';
import { useAccounts } from '@/hooks/useAccounts';
import { useLeads } from '@/hooks/useLeads';

// Icon mapping
const ICON_MAP: Record<string, React.ElementType> = {
  Scale,
  Search,
  FileCheck,
  FileSearch,
  FileText,
  FileDigit,
  Brain,
  Sparkles,
};

// Color mapping
const COLOR_MAP: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600',
  purple: 'from-purple-500 to-purple-600',
  green: 'from-green-500 to-green-600',
  orange: 'from-orange-500 to-orange-600',
  teal: 'from-teal-500 to-teal-600',
  indigo: 'from-indigo-500 to-indigo-600',
  slate: 'from-slate-500 to-slate-600',
};

interface UploadedDocument {
  id: string;
  file?: File;
  filename: string;
  storagePath?: string;
  status: 'uploading' | 'uploaded' | 'existing';
}

export default function AIModuleExecute() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch module config
  const { data: module, isLoading: moduleLoading, error: moduleError } = useAIModule(moduleSlug);
  const executeModule = useExecuteModule();

  // State
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [inputText, setInputText] = useState(searchParams.get('q') || '');
  const [additionalInputs, setAdditionalInputs] = useState<Record<string, string>>({});
  const [linkType, setLinkType] = useState<'account' | 'lead' | 'policy' | null>(null);
  const [linkId, setLinkId] = useState<string>('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [executionResult, setExecutionResult] = useState<Record<string, unknown> | null>(null);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);

  // Data for linking
  const { data: accountsData } = useAccounts();
  const accounts = accountsData || [];
  const { data: leadsData } = useLeads();
  const leads = leadsData?.leads || [];

  const inputConfig = module?.input_config as AIModuleInputConfig || {};
  const minDocs = inputConfig.min_documents || 1;
  const maxDocs = inputConfig.max_documents || 10;
  const docLabels = inputConfig.document_labels || [];
  const additionalFields = inputConfig.additional_fields || [];
  const allowTextInput = inputConfig.allow_text_input !== false;
  const inputPlaceholder = inputConfig.input_placeholder || 'Enter any additional context or questions...';

  const IconComponent = module?.icon ? ICON_MAP[module.icon] || FileText : FileText;
  const gradientClass = module?.color ? COLOR_MAP[module.color] || COLOR_MAP.blue : COLOR_MAP.blue;

  // File upload handler
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (documents.length + acceptedFiles.length > maxDocs) {
      toast({
        title: 'Too many documents',
        description: `Maximum ${maxDocs} documents allowed.`,
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    
    for (const file of acceptedFiles) {
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      
      // Add to state as uploading
      setDocuments(prev => [...prev, {
        id: tempId,
        file,
        filename: file.name,
        status: 'uploading',
      }]);

      try {
        // Upload to Supabase storage
        const filePath = `ai-uploads/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Create document record
        const { data: { user } } = await supabase.auth.getUser();
        const { data: docRecord, error: dbError } = await supabase
          .from('documents')
          .insert({
            filename: file.name,
            storage_path: filePath,
            kind: 'ai-upload',
            created_by: user?.id,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // Update state with real ID
        setDocuments(prev => prev.map(d => 
          d.id === tempId 
            ? { id: docRecord.id, filename: file.name, storagePath: filePath, status: 'uploaded' as const }
            : d
        ));

      } catch (error: any) {
        console.error('Upload error:', error);
        toast({
          title: 'Upload failed',
          description: error.message,
          variant: 'destructive',
        });
        // Remove failed upload
        setDocuments(prev => prev.filter(d => d.id !== tempId));
      }
    }

    setIsUploading(false);
  }, [documents.length, maxDocs, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: maxDocs - documents.length,
  });

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  // Execute analysis
  const handleExecute = async () => {
    if (documents.length < minDocs) {
      toast({
        title: 'More documents needed',
        description: `Please upload at least ${minDocs} document${minDocs > 1 ? 's' : ''}.`,
        variant: 'destructive',
      });
      return;
    }

    // Check required additional fields
    for (const field of additionalFields) {
      if (field.required && !additionalInputs[field.name]) {
        toast({
          title: 'Required field missing',
          description: `Please fill in "${field.label}".`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const result = await executeModule.mutateAsync({
        module_slug: moduleSlug!,
        document_ids: documents.filter(d => !d.id.startsWith('temp-')).map(d => d.id),
        input_text: inputText || undefined,
        additional_inputs: Object.keys(additionalInputs).length > 0 ? additionalInputs : undefined,
        link_to: linkType && linkId ? { type: linkType, id: linkId } : undefined,
      });

      setExecutionResult(result.result);
      
      // Extract email draft if present
      const emailData = result.result?.email_draft as { subject?: string; body?: string } | undefined;
      if (emailData) {
        setEmailDraft({
          subject: emailData.subject || '',
          body: emailData.body || '',
        });
      }

      toast({
        title: 'Analysis Complete',
        description: `Completed in ${(result.processing_time_ms / 1000).toFixed(1)}s`,
      });
    } catch (error: any) {
      console.error('Execution error:', error);
    }
  };

  // Get link display name
  const getLinkDisplayName = () => {
    if (!linkType || !linkId) return null;
    if (linkType === 'account') {
      const account = accounts.find(a => a.id === linkId);
      return account?.name || linkId;
    }
    if (linkType === 'lead') {
      const lead = leads.find(l => l.id === linkId);
      return lead?.name || linkId;
    }
    return linkId;
  };

  // Loading state
  if (moduleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Error state
  if (moduleError || !module) {
    return (
      <AppLayout>
        <div className="p-6 max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate('/ai/hub')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AI Hub
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Module Not Found</h2>
              <p className="text-muted-foreground">
                The module "{moduleSlug}" could not be found or is not active.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Button variant="ghost" onClick={() => navigate('/ai/hub')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to AI Hub
          </Button>

          <div className="flex items-start gap-4">
            <div className={cn('p-3 rounded-xl bg-gradient-to-br text-white', gradientClass)}>
              <IconComponent className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{module.name}</h1>
              <p className="text-muted-foreground">{module.description}</p>
            </div>
          </div>
        </div>

        {/* Document Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload Documents</CardTitle>
            <CardDescription>
              {minDocs === maxDocs 
                ? `Upload ${minDocs} document${minDocs > 1 ? 's' : ''}`
                : `Upload ${minDocs} to ${maxDocs} documents`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Document slots with labels */}
            {docLabels.length > 0 ? (
              docLabels.map((label, index) => (
                <div key={index} className="space-y-2">
                  <Label>{label}</Label>
                  {documents[index] ? (
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                      <FileText className="h-5 w-5 text-blue-500" />
                      <span className="flex-1 truncate">{documents[index].filename}</span>
                      {documents[index].status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDocument(documents[index].id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      {...getRootProps()}
                      className={cn(
                        'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                        isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                      )}
                    >
                      <input {...getInputProps()} />
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drop file here or click to browse
                      </p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <>
                {/* Uploaded documents */}
                {documents.length > 0 && (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <FileText className="h-5 w-5 text-blue-500" />
                        <span className="flex-1 truncate">{doc.filename}</span>
                        {doc.status === 'uploading' && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        {doc.status === 'uploaded' && (
                          <Badge variant="secondary">Uploaded</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDocument(doc.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone */}
                {documents.length < maxDocs && (
                  <div
                    {...getRootProps()}
                    className={cn(
                      'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                      isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                    )}
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium mb-1">
                      {isDragActive ? 'Drop files here' : 'Drop PDF files here or click to browse'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Supports PDF, Word, and image files
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Additional Fields */}
        {additionalFields.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {additionalFields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  
                  {field.type === 'select' && field.options ? (
                    <Select
                      value={additionalInputs[field.name] || field.default || ''}
                      onValueChange={(value) => 
                        setAdditionalInputs(prev => ({ ...prev, [field.name]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'textarea' ? (
                    <Textarea
                      id={field.name}
                      value={additionalInputs[field.name] || ''}
                      onChange={(e) => 
                        setAdditionalInputs(prev => ({ ...prev, [field.name]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      rows={4}
                    />
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={additionalInputs[field.name] || ''}
                      onChange={(e) => 
                        setAdditionalInputs(prev => ({ ...prev, [field.name]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Text Input */}
        {allowTextInput && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Additional Input</CardTitle>
              <CardDescription>Optional context or specific questions</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={inputPlaceholder}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>
        )}

        {/* Link to Record */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Link to Record
            </CardTitle>
            <CardDescription>Optionally link this analysis to an account or lead</CardDescription>
          </CardHeader>
          <CardContent>
            {linkId && linkType ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm py-1.5">
                  {linkType === 'account' ? 'Account' : 'Lead'}: {getLinkDisplayName()}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setLinkId(''); setLinkType(null); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Popover open={linkOpen} onOpenChange={setLinkOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-between min-w-[200px]">
                      Select account or lead
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search..." />
                      <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        {accounts.length > 0 && (
                          <CommandGroup heading="Accounts">
                            {accounts.slice(0, 10).map((account) => (
                              <CommandItem
                                key={account.id}
                                onSelect={() => {
                                  setLinkType('account');
                                  setLinkId(account.id);
                                  setLinkOpen(false);
                                }}
                              >
                                {account.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {leads.length > 0 && (
                          <CommandGroup heading="Leads">
                            {leads.slice(0, 10).map((lead) => (
                              <CommandItem
                                key={lead.id}
                                onSelect={() => {
                                  setLinkType('lead');
                                  setLinkId(lead.id);
                                  setLinkOpen(false);
                                }}
                              >
                                {lead.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Execute Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={handleExecute}
            disabled={documents.length < minDocs || executeModule.isPending || isUploading}
            className="px-8"
          >
            {executeModule.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {executionResult && module && (
          <>
            <Separator className="my-8" />
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Results</h2>
              <AIResultsDisplay
                result={executionResult}
                outputConfig={module.output_config}
                emailDraft={emailDraft}
                reportHtml={executionResult.proposal_html as string || executionResult.report_html as string}
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

