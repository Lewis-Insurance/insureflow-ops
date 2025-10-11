import React, { useState } from 'react';
import { 
  Plus, Upload, Brain, AlertCircle, CheckCircle, 
  Database, FileText, Download, Trash2, Edit,
  TrendingUp, HelpCircle, BookOpen, Tag
} from 'lucide-react';
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
  const [selectedGap, setSelectedGap] = useState<any>(null);
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
  const convertGapToKnowledge = (gap: any) => {
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
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Sample bulk import data
  const SAMPLE_KNOWLEDGE = `title,content,category,tags,source
"Auto Liability Coverage","Bodily injury and property damage liability protects you when you're at fault. State minimums vary but we recommend 100/300/100.","policies","auto|liability|coverage","Lewis Policy Guide"
"Homeowners Deductible","Standard deductibles are $500, $1000, or $2500. Higher deductible = lower premium. Separate deductibles may apply for wind/hail.","policies","home|deductible","Lewis Policy Guide"
"Filing a Claim Online","Visit lewis-insurance.com/claims, click File a Claim, enter policy number, describe incident, upload photos. Adjuster contacts within 24 hours.","procedures","claims|online|process","Claims SOP"
"Bundle Discount Eligibility","Combine 2+ policies (auto, home, umbrella) for 25% discount. All policies must be active. Discount applies at renewal.","products","bundle|discount|savings","Product Catalog"`;

  // Handle CSV import
  const handleBulkImport = async (csvContent: string) => {
    try {
      const lines = csvContent.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      
      const entries = lines.slice(1).map(line => {
        const values = line.match(/(".*?"|[^,]+)/g) || [];
        const entry: any = {};
        headers.forEach((header, index) => {
          entry[header] = values[index]?.replace(/^"|"$/g, '').trim() || '';
        });
        return entry;
      });
      
      // Process each entry
      for (const entry of entries) {
        const knowledgeData = {
          title: entry.title,
          content: entry.content,
          category: entry.category,
          tags: entry.tags.split('|').map((t: string) => t.trim()),
          source: entry.source || 'Bulk Import'
        };
        
        await supabase.from('knowledge_base').insert(knowledgeData);
      }
      
      toast({
        title: "Success",
        description: `Imported ${entries.length} knowledge entries`,
      });
      
      // Generate embeddings for all
      await updateEmbeddings();
      
      setShowBulkImport(false);
      fetchKnowledgeBase();
    } catch (error: any) {
      toast({
        title: "Import Error",
        description: error.message,
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
                Add and manage insurance knowledge for your AI Brain
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
            <DialogTitle>Bulk Import Knowledge</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                <p className="font-medium mb-2">CSV Format Required:</p>
                <code className="text-xs block bg-muted p-2 rounded font-mono">
                  title,content,category,tags,source
                </code>
                <p className="text-xs mt-2">Tags should be pipe-separated (|) within the tags column</p>
              </AlertDescription>
            </Alert>
            
            <div>
              <label className="text-sm font-medium">Paste CSV Data</label>
              <Textarea
                defaultValue={SAMPLE_KNOWLEDGE}
                rows={15}
                className="font-mono text-xs"
                id="csv-import"
              />
            </div>
            
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([SAMPLE_KNOWLEDGE], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'knowledge-template.csv';
                  a.click();
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
              
              <div className="space-x-2">
                <Button variant="outline" onClick={() => setShowBulkImport(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  const textarea = document.getElementById('csv-import') as HTMLTextAreaElement;
                  handleBulkImport(textarea.value);
                }}>
                  Import Knowledge
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
