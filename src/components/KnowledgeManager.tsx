import React, { useState, useRef } from 'react';
import {
  Plus, Upload, Brain, AlertCircle, CheckCircle,
  Database, FileText, Download, Trash2, Edit,
  TrendingUp, HelpCircle, BookOpen, Tag
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { useKnowledgeGaps } from '@/hooks/useKnowledgeGaps';
import { useAIBrain } from '@/hooks/useAIBrain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const KnowledgeManager = () => {
  const { entries, fetchKnowledgeBase } = useKnowledgeBase();
  const { gaps, markAsAnswered } = useKnowledgeGaps();
  const { updateEmbeddings } = useAIBrain();
  const { toast } = useToast();
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [importTable, setImportTable] = useState<'kb_entries' | 'kb_sources'>('kb_entries');
  const [selectedGap, setSelectedGap] = useState<{ id: string; question: string; frequency: number } | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newEntry, setNewEntry] = useState({
    title: '',
    content: '',
    category: 'policies',
    tags: '',
    source: 'Manual Entry'
  });

  // Categories for insurance knowledge
  const CATEGORIES = [
    { value: 'policies', label: 'Insurance Policies', icon: FileText },
    { value: 'claims', label: 'Claims Process', icon: AlertCircle },
    { value: 'products', label: 'Products & Pricing', icon: TrendingUp },
    { value: 'regulations', label: 'State Regulations', icon: BookOpen },
    { value: 'procedures', label: 'Internal Procedures', icon: Database },
    { value: 'faqs', label: 'Customer FAQs', icon: HelpCircle },
  ];

  // Convert a knowledge gap into knowledge entry
  const convertGapToKnowledge = (gap: { id: string; question: string; frequency: number }) => {
    setSelectedGap(gap);
    setNewEntry({
      title: gap.question,
      content: '', // User needs to provide the answer
      category: 'faqs',
      tags: 'customer-question, frequent',
      source: 'Customer Question'
    });
    setShowAddDialog(true);
  };

  // Handle single knowledge addition
  const handleAddKnowledge = async () => {
    try {
      const knowledgeData = {
        ...newEntry,
        tags: newEntry.tags.split(',').map(t => t.trim()).filter(t => t)
      };
      
      // Add to database
      const { data, error } = await supabase
        .from('knowledge_base')
        .insert(knowledgeData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Mark gap as answered if converting from gap
      if (selectedGap) {
        await markAsAnswered(selectedGap.id);
      }
      
      toast({
        title: "Success",
        description: "Knowledge added successfully! Generating AI embeddings...",
      });
      
      // Generate embedding
      await updateEmbeddings();
      
      // Reset and close
      setShowAddDialog(false);
      setSelectedGap(null);
      setNewEntry({
        title: '',
        content: '',
        category: 'policies',
        tags: '',
        source: 'Manual Entry'
      });
      
      fetchKnowledgeBase();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    }
  };

  // Handle file upload (CSV, PDF, or Images)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isCsv = fileName.endsWith('.csv');
    const isImage = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || 
                    fileName.endsWith('.png') || fileName.endsWith('.webp');

    if (!isPdf && !isCsv && !isImage) {
      toast({
        title: "Invalid File",
        description: "Please upload a CSV, PDF, or image file (JPG, PNG, WEBP)",
        variant: "destructive",
      });
      return;
    }

    setUploadedFileName(file.name);

    if (isPdf || isImage) {
      // Handle PDF or Image upload with OCR
      setIsProcessingPdf(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        toast({
          title: isImage ? "Processing Image..." : "Processing PDF...",
          description: "Using AI to extract knowledge from your document",
        });

        const { data, error } = await supabase.functions.invoke('parse-document-ocr', {
          body: formData
        });

        if (error) throw error;
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to parse document');
        }

        const { entries, metadata } = data;
        
        toast({
          title: "Document Parsed Successfully",
          description: `Extracted ${entries.length} knowledge entries using AI OCR`,
        });
        
        // Convert to CSV format for existing import logic
        const csvLines = ['product_line,topic,question,answer_short,answer_canonical,tags,carrier,program,jurisdiction'];
        entries.forEach((entry: { category?: string; title: string; content: string; tags?: string | string[]; carrier?: string; jurisdiction?: string }) => {
          const tags = Array.isArray(entry.tags) ? entry.tags.join('|') : (entry.tags || '');
          const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;
          csvLines.push([
            escapeCsv(entry.category || 'general'),
            escapeCsv(entry.category || 'general'),
            escapeCsv(entry.title),
            escapeCsv(entry.content.substring(0, 200)),
            escapeCsv(entry.content),
            tags,
            entry.carrier || 'ALL',
            '',
            entry.jurisdiction || 'FL'
          ].join(','));
        });
        
        setCsvContent(csvLines.join('\n'));
      } catch (error) {
        logger.error('Document parsing error:', error);
        toast({
          title: "Document Parsing Failed",
          description: error instanceof Error ? error.message : 'Failed to parse document',
          variant: "destructive",
        });
        setUploadedFileName('');
      } finally {
        setIsProcessingPdf(false);
      }
    } else {
      // Handle CSV upload
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCsvContent(content);
        toast({
          title: "File Loaded",
          description: `${file.name} loaded successfully`,
        });
      };
      reader.onerror = () => {
        toast({
          title: "Upload Error",
          description: "Failed to read file",
          variant: "destructive",
        });
        setUploadedFileName('');
      };
      reader.readAsText(file);
    }
  };

  // Sample bulk import data for kb_entries
  const SAMPLE_KB_ENTRIES = `product_line,topic,question,answer_short,answer_canonical,tags,carrier,program,jurisdiction
"Auto","Coverage","What is comprehensive coverage?","Covers non-collision damage like theft, vandalism, weather","Comprehensive coverage protects your vehicle from non-collision incidents including:\n- Theft\n- Vandalism\n- Weather damage (hail, flood)\n- Animal strikes\n- Falling objects\n\nDeductibles typically range from $250-$1000.","auto|comprehensive|physical-damage","ALL","","FL"
"Claims","Process","How do I file a claim?","Call 1-800-CLAIMS or use our mobile app within 24 hours","To file a claim:\n1. Contact us at 1-800-CLAIMS or use mobile app\n2. Provide policy number and incident details\n3. Upload photos if available\n4. Adjuster will contact within 24 hours\n\nRequired information:\n- Date, time, location of incident\n- Police report number (if applicable)\n- Other party information (if applicable)","claims|process|filing|steps","ALL","","FL"`;

  // Sample bulk import data for kb_sources
  const SAMPLE_KB_SOURCES = `name,source_type,publisher,jurisdiction,url_or_path,version,notes
"State Farm Auto Policy Guide 2024","policy_document","State Farm","FL","https://statefarm.com/policy-guide-2024.pdf","2024","Complete guide to auto insurance coverages and state requirements"
"Progressive Claims Process SOP","internal_doc","Progressive","FL","https://progressive.com/claims-sop","2024","Step-by-step claims filing procedures for all lines of business"
"NAIC State Requirements Database","external_reference","NAIC","ALL","https://naic.org/state-requirements","2024","Official state-by-state insurance requirements and minimums"
"Carrier Rate Sheets 2024","rate_sheet","Lewis Insurance","FL","https://agency.com/rates/2024","2024","Current rate tables for all carriers and products"`;

  // Handle CSV import for kb_entries and kb_sources
  const handleBulkImport = async (csvContent: string, table: 'kb_entries' | 'kb_sources') => {
    try {
      const lines = csvContent.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      
      const entries = lines.slice(1).map(line => {
        const values = line.match(/(".*?"|[^,]+)/g) || [];
        const entry: Record<string, string> = {};
        headers.forEach((header, index) => {
          entry[header] = values[index]?.replace(/^"|"$/g, '').trim() || '';
        });
        return entry;
      });

      // Process each entry based on table type
      for (const [index, entry] of entries.entries()) {
        let rowData: Record<string, unknown>;
        
        if (table === 'kb_entries') {
          // Generate a unique record_id
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(7);
          const record_id = `KB-${timestamp}-${random}`;
          
          // Parse the entry into the correct schema
          rowData = {
            record_id: record_id,
            product_line: entry.product_line || 'general',
            topic: entry.topic || 'general',
            question_canonical: entry.question,
            answer_canonical_markdown: entry.answer_canonical || entry.answer_long || entry.answer,
            faq_short_answer: entry.answer_short || entry.answer_canonical?.substring(0, 200) || '',
            jurisdiction: entry.jurisdiction || 'FL',
            carrier: entry.carrier || 'ALL',
            program_or_form: entry.program || '',
            tags: entry.tags || '',
            source_type: 'manual_import',
            confidence: 3
          };
        } else if (table === 'kb_sources') {
          // Generate source_id
          const source_id = `SRC-${Date.now()}-${index}`;
          
          rowData = {
            source_id: source_id,
            name: entry.name || entry.title,
            source_type: entry.source_type || 'internal_doc',
            publisher: entry.publisher || 'Lewis Insurance',
            jurisdiction: entry.jurisdiction || 'FL',
            url_or_path: entry.url_or_path || entry.url || '',
            version_or_date: entry.version || new Date().toISOString().split('T')[0],
            notes: entry.notes || entry.description || ''
          };
        }
        
        const { error } = await supabase.from(table).insert(rowData);
        if (error) {
          logger.error(`Error inserting row ${index + 1}:`, error);
          // Continue with other rows even if one fails
        }
      }
      
      toast({
        title: "Success",
        description: `Imported ${entries.length} records to ${table}`,
      });
      
      setShowBulkImport(false);
      if (table === 'kb_entries') {
        fetchKnowledgeBase();
      }
    } catch (error) {
      toast({
        title: "Import Error",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    }
  };

  // Top unanswered questions
  const topGaps = gaps.filter(g => !g.answered).slice(0, 5);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Knowledge Management Center</CardTitle>
              <CardDescription>
                Add and manage insurance knowledge for your AI Brain. Upload documents, screenshots, or CSV files.
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => setShowBulkImport(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Bulk Import
              </Button>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Knowledge
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* OCR Feature Notice */}
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <strong>AI-Powered OCR:</strong> Upload screenshots or photos of documents, and our AI will automatically extract and structure the knowledge for you.
        </AlertDescription>
      </Alert>

      {/* Knowledge Gaps Alert */}
      {topGaps.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">Top Unanswered Customer Questions:</p>
              <div className="space-y-1">
                {topGaps.map(gap => (
                  <div key={gap.id} className="flex items-center justify-between py-1">
                    <span className="text-sm">{gap.question} (asked {gap.frequency} times)</span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => convertGapToKnowledge(gap)}
                    >
                      Answer This
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Add Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Add Templates</CardTitle>
          <CardDescription>Use templates to quickly add common knowledge types</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Button 
              variant="outline" 
              className="h-auto flex-col py-4"
              onClick={() => {
                setNewEntry({
                  title: 'Coverage: ',
                  content: 'This coverage includes:\n- \n- \n\nExclusions:\n- \n\nDeductible: $\n\nRequired in states: ',
                  category: 'policies',
                  tags: 'coverage',
                  source: 'Policy Manual'
                });
                setShowAddDialog(true);
              }}
            >
              <FileText className="w-8 h-8 mb-2 text-blue-600" />
              <span>Policy Coverage</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto flex-col py-4"
              onClick={() => {
                setNewEntry({
                  title: 'How to: ',
                  content: 'Step 1: \nStep 2: \nStep 3: \n\nRequired documents:\n- \n\nTimeline: ',
                  category: 'procedures',
                  tags: 'how-to, process',
                  source: 'Procedure Manual'
                });
                setShowAddDialog(true);
              }}
            >
              <BookOpen className="w-8 h-8 mb-2 text-green-600" />
              <span>Procedure</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto flex-col py-4"
              onClick={() => {
                setNewEntry({
                  title: 'State Requirements: ',
                  content: 'Minimum coverage:\n- Bodily Injury: $/$\n- Property Damage: $\n- PIP/Medical: $\n\nAdditional requirements:\n- ',
                  category: 'regulations',
                  tags: 'state, requirements',
                  source: 'State Department'
                });
                setShowAddDialog(true);
              }}
            >
              <AlertCircle className="w-8 h-8 mb-2 text-purple-600" />
              <span>State Regulation</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto flex-col py-4"
              onClick={() => {
                setNewEntry({
                  title: 'Discount: ',
                  content: 'Eligibility:\n- \n\nDiscount amount: %\n\nHow to qualify:\n1. \n2. \n\nRestrictions: ',
                  category: 'products',
                  tags: 'discount, savings',
                  source: 'Product Catalog'
                });
                setShowAddDialog(true);
              }}
            >
              <TrendingUp className="w-8 h-8 mb-2 text-orange-600" />
              <span>Discount/Product</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto flex-col py-4"
              onClick={() => {
                setNewEntry({
                  title: 'FAQ: ',
                  content: 'Question: \n\nAnswer: \n\nRelated topics: ',
                  category: 'faqs',
                  tags: 'faq, customer',
                  source: 'Customer Service'
                });
                setShowAddDialog(true);
              }}
            >
              <HelpCircle className="w-8 h-8 mb-2 text-pink-600" />
              <span>FAQ Answer</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="h-auto flex-col py-4"
              onClick={() => {
                setNewEntry({
                  title: 'Claim: ',
                  content: 'When to file:\n- \n\nRequired documentation:\n- \n\nProcess:\n1. \n2. \n\nTypical timeline: ',
                  category: 'claims',
                  tags: 'claims',
                  source: 'Claims Department'
                });
                setShowAddDialog(true);
              }}
            >
              <Database className="w-8 h-8 mb-2 text-red-600" />
              <span>Claims Info</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const count = entries.filter(e => e.category === cat.value).length;
          return (
            <Card key={cat.value}>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Icon className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-gray-500">{cat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Knowledge Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedGap ? 'Answer Customer Question' : 'Add Insurance Knowledge'}
            </DialogTitle>
            {selectedGap && (
              <Alert className="mt-2">
                <AlertDescription>
                  Answering question asked {selectedGap.frequency} times: "{selectedGap.question}"
                </AlertDescription>
              </Alert>
            )}
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title / Question</label>
              <Input
                value={newEntry.title}
                onChange={(e) => setNewEntry({...newEntry, title: e.target.value})}
                placeholder="e.g., What does comprehensive coverage include?"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Content / Answer</label>
              <Textarea
                value={newEntry.content}
                onChange={(e) => setNewEntry({...newEntry, content: e.target.value})}
                placeholder="Provide detailed explanation..."
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Be specific. Include numbers, percentages, dollar amounts, and examples.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select 
                  value={newEntry.category} 
                  onValueChange={(v) => setNewEntry({...newEntry, category: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
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
              
              <div>
                <label className="text-sm font-medium">Source</label>
                <Input
                  value={newEntry.source}
                  onChange={(e) => setNewEntry({...newEntry, source: e.target.value})}
                  placeholder="e.g., Policy Manual v2.3"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Tags (comma separated)</label>
              <Input
                value={newEntry.tags}
                onChange={(e) => setNewEntry({...newEntry, tags: e.target.value})}
                placeholder="auto, coverage, comprehensive, damage"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddKnowledge}>
              Add to Knowledge Base
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showBulkImport} onOpenChange={setShowBulkImport}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Import CSV</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Table Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Import to Table:</label>
              <Select value={importTable} onValueChange={(v: 'kb_entries' | 'kb_sources') => setImportTable(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kb_entries">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      <span>kb_entries (Knowledge Entries)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="kb_sources">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>kb_sources (Source Documents)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format Info */}
            <Alert>
              <AlertDescription>
                <p className="font-medium mb-2">CSV Format for {importTable}:</p>
                {importTable === 'kb_entries' ? (
                  <>
                    <code className="text-xs block bg-muted p-2 rounded font-mono mb-2">
                      product_line,topic,question,answer_short,answer_canonical,tags,carrier,program,jurisdiction
                    </code>
                    <ul className="text-xs space-y-1 mt-2">
                      <li>• <strong>product_line</strong>: Insurance product line (e.g., "Auto", "Home")</li>
                      <li>• <strong>topic</strong>: Topic category (e.g., "Coverage", "Claims")</li>
                      <li>• <strong>question</strong>: The question being answered (required)</li>
                      <li>• <strong>answer_short</strong>: Brief answer for quick display</li>
                      <li>• <strong>answer_canonical</strong>: Full detailed answer in markdown</li>
                      <li>• <strong>tags</strong>: Comma or pipe-separated tags</li>
                      <li>• <strong>carrier</strong>: Carrier code or "ALL" for all carriers</li>
                      <li>• <strong>program</strong>: Program/form name (optional)</li>
                      <li>• <strong>jurisdiction</strong>: State code (e.g., "FL", "ALL")</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <code className="text-xs block bg-muted p-2 rounded font-mono mb-2">
                      name,source_type,publisher,jurisdiction,url_or_path,version,notes
                    </code>
                    <ul className="text-xs space-y-1 mt-2">
                      <li>• <strong>name</strong>: Name of the source document (required)</li>
                      <li>• <strong>source_type</strong>: Type (e.g., "policy_document", "rate_sheet", "internal_doc")</li>
                      <li>• <strong>publisher</strong>: Publisher/carrier name</li>
                      <li>• <strong>jurisdiction</strong>: State code or "ALL"</li>
                      <li>• <strong>url_or_path</strong>: Link or file path to the document</li>
                      <li>• <strong>version</strong>: Version or date (YYYY-MM-DD)</li>
                      <li>• <strong>notes</strong>: Description or additional notes</li>
                    </ul>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* File Upload Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">Upload CSV, PDF, or Image File</label>
                {uploadedFileName && (
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    {uploadedFileName}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                  disabled={isProcessingPdf}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isProcessingPdf ? 'Processing Document...' : 'Choose File (CSV, PDF, or Image)'}
                </Button>
                {uploadedFileName && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCsvContent('');
                      setUploadedFileName('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* OR Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or paste CSV data</span>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Paste CSV Data</label>
              <Textarea
                value={csvContent}
                onChange={(e) => {
                  setCsvContent(e.target.value);
                  setUploadedFileName('');
                }}
                placeholder={importTable === 'kb_entries' 
                  ? 'Upload a file (PDF, Image, CSV) or paste CSV data here...' 
                  : 'Paste CSV data for knowledge sources...'}
                key={importTable}
                rows={12}
                className="font-mono text-xs"
                id="csv-import"
              />
            </div>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  const csvData = importTable === 'kb_entries' ? SAMPLE_KB_ENTRIES : SAMPLE_KB_SOURCES;
                  const blob = new Blob([csvData], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${importTable}-template.csv`;
                  a.click();
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
              
              <div className="space-x-2">
                <Button variant="outline" onClick={() => {
                  setShowBulkImport(false);
                  setCsvContent('');
                  setUploadedFileName('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  const content = csvContent || (document.getElementById('csv-import') as HTMLTextAreaElement).value;
                  if (!content.trim()) {
                    toast({
                      title: "No Data",
                      description: "Please upload a file or paste CSV data",
                      variant: "destructive",
                    });
                    return;
                  }
                  handleBulkImport(content, importTable);
                  setCsvContent('');
                  setUploadedFileName('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}>
                  Import to {importTable}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeManager;
