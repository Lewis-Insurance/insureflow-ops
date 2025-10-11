import React, { useState, useCallback, useEffect } from 'react';
import { 
  Brain, BookOpen, Database, Sparkles, Upload, 
  Search, Plus, Edit, Trash2, Save, X, Check,
  FileText, Link, Tag, Layers, RefreshCw,
  Shield, AlertCircle, Zap, BookMarked, 
  Building, Users, DollarSign, Scale, Info,
  ChevronRight, ChevronDown, FolderOpen, Hash, Loader2
} from 'lucide-react';
import { useAIBrain } from '@/hooks/useAIBrain';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const InsuranceAIBrain = () => {
  const { addKnowledge, updateEmbeddings, loading } = useAIBrain();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('overview');
  const [knowledgeBase, setKnowledgeBase] = useState({
    policies: [],
    regulations: [],
    procedures: [],
    products: [],
    faqs: [],
    terminology: [],
    templates: [],
    training: []
  });
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Import form state
  const [importForm, setImportForm] = useState({
    title: '',
    content: '',
    category: 'general',
    tags: '',
    source: 'manual'
  });
  const [brainStats, setBrainStats] = useState({
    totalEntries: 1247,
    categories: 8,
    lastUpdated: new Date().toISOString(),
    accuracy: 94.5,
    queriesAnswered: 15234,
    avgResponseTime: 1.2
  });

  // Sample knowledge entries
  const sampleKnowledge = {
    policies: [
      {
        id: 1,
        title: 'Auto Insurance Coverage Types',
        content: 'Comprehensive coverage includes collision, liability, medical payments, uninsured motorist protection...',
        category: 'Auto Insurance',
        tags: ['coverage', 'auto', 'liability'],
        confidence: 98,
        source: 'Lewis Insurance Policy Manual v2.3',
        lastUpdated: '2024-01-15',
        usage: 342
      },
      {
        id: 2,
        title: 'Homeowners Insurance Exclusions',
        content: 'Standard exclusions include flood damage, earth movement, war, nuclear hazard...',
        category: 'Home Insurance',
        tags: ['exclusions', 'home', 'coverage'],
        confidence: 95,
        source: 'Industry Standards 2024',
        lastUpdated: '2024-02-01',
        usage: 156
      }
    ],
    regulations: [
      {
        id: 3,
        title: 'State Insurance Regulations - Florida',
        content: 'Florida requires minimum PIP coverage of $10,000, property damage liability of $10,000...',
        category: 'Compliance',
        tags: ['Florida', 'regulations', 'requirements'],
        confidence: 100,
        source: 'Florida Department of Insurance',
        lastUpdated: '2024-03-01',
        usage: 89
      }
    ],
    procedures: [
      {
        id: 4,
        title: 'Claims Processing Workflow',
        content: '1. Initial claim filing 2. Documentation review 3. Investigation 4. Evaluation 5. Settlement...',
        category: 'Operations',
        tags: ['claims', 'workflow', 'process'],
        confidence: 97,
        source: 'Lewis Insurance SOP',
        lastUpdated: '2024-01-20',
        usage: 523
      }
    ],
    products: [
      {
        id: 5,
        title: 'Lewis Premium Protection Plan',
        content: 'Our flagship comprehensive coverage combining auto, home, and umbrella policies with 20% bundle discount...',
        category: 'Products',
        tags: ['bundle', 'premium', 'discount'],
        confidence: 100,
        source: 'Product Catalog 2024',
        lastUpdated: '2024-03-15',
        usage: 678
      }
    ],
    faqs: [],
    terminology: [],
    templates: [],
    training: []
  };

  useEffect(() => {
    // Initialize with sample data (in production, fetch from knowledge_base table)
    setKnowledgeBase(sampleKnowledge);
  }, []);

  const handleImportKnowledge = async () => {
    if (!importForm.title.trim() || !importForm.content.trim()) {
      toast({
        title: "Validation Error",
        description: "Title and content are required",
        variant: "destructive"
      });
      return;
    }

    const tags = importForm.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const result = await addKnowledge({
      title: importForm.title,
      content: importForm.content,
      category: importForm.category,
      tags,
      source: importForm.source
    });

    if (result) {
      // Reset form and close dialog
      setImportForm({
        title: '',
        content: '',
        category: 'general',
        tags: '',
        source: 'manual'
      });
      setIsImporting(false);
      
      toast({
        title: "Success",
        description: "Knowledge entry added and embedded successfully"
      });
    }
  };

  const handleSyncKnowledge = async () => {
    const result = await updateEmbeddings();
    if (result) {
      toast({
        title: "Sync Complete",
        description: `Updated ${result.updated} knowledge entries`
      });
    }
  };

  const KnowledgeEntry = ({ entry, onEdit, onDelete }) => (
    <div className="bg-card rounded-lg border border-border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-semibold text-foreground flex items-center">
            {entry.title}
            {entry.confidence >= 95 && (
              <Check className="w-4 h-4 text-green-600 ml-2" />
            )}
          </h4>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{entry.content}</p>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onEdit(entry)}
            className="p-1 hover:bg-accent rounded"
          >
            <Edit className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => onDelete(entry.id)}
            className="p-1 hover:bg-accent rounded"
          >
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center space-x-2">
          {entry.tags.map((tag, idx) => (
            <span key={idx} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center space-x-3 text-xs text-muted-foreground">
          <span className="flex items-center">
            <Database className="w-3 h-3 mr-1" />
            {entry.usage} uses
          </span>
          <span className="flex items-center">
            <Shield className="w-3 h-3 mr-1" />
            {entry.confidence}%
          </span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">Source: {entry.source}</span>
        <span className="text-xs text-muted-foreground">Updated: {entry.lastUpdated}</span>
      </div>
    </div>
  );

  const CategorySection = ({ title, icon: Icon, entries, color }) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`p-2 ${color} rounded-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <span className="px-2 py-1 bg-muted text-muted-foreground text-sm rounded-full">
            {entries.length} entries
          </span>
        </div>
        <button className="flex items-center space-x-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add Entry</span>
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {entries.map((entry) => (
          <KnowledgeEntry 
            key={entry.id} 
            entry={entry}
            onEdit={(e) => {
              setSelectedItem(e);
              setIsEditing(true);
            }}
            onDelete={(id) => console.log('Delete:', id)}
          />
        ))}
      </div>
    </div>
  );

  const BrainOverview = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Knowledge Entries</span>
            <Database className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-foreground">{brainStats.totalEntries}</div>
          <div className="text-xs text-green-600 mt-1">+89 this month</div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">AI Accuracy</span>
            <Brain className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-foreground">{brainStats.accuracy}%</div>
          <div className="text-xs text-green-600 mt-1">+2.3% improvement</div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Queries Answered</span>
            <Search className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-foreground">{brainStats.queriesAnswered.toLocaleString()}</div>
          <div className="text-xs text-blue-600 mt-1">1,234 today</div>
        </div>
        
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Response Time</span>
            <Zap className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-foreground">{brainStats.avgResponseTime}s</div>
          <div className="text-xs text-green-600 mt-1">-0.3s faster</div>
        </div>
      </div>

      {/* Knowledge Categories */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Knowledge Categories</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'Insurance Policies', icon: FileText, count: 234, color: 'text-blue-600' },
            { name: 'Regulations', icon: Scale, count: 89, color: 'text-purple-600' },
            { name: 'Procedures', icon: BookOpen, count: 156, color: 'text-green-600' },
            { name: 'Products', icon: Building, count: 45, color: 'text-orange-600' },
            { name: 'FAQs', icon: Info, count: 312, color: 'text-pink-600' },
            { name: 'Terminology', icon: Hash, count: 189, color: 'text-indigo-600' },
            { name: 'Templates', icon: Layers, count: 67, color: 'text-yellow-600' },
            { name: 'Training', icon: BookMarked, count: 155, color: 'text-red-600' }
          ].map((category, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSection(category.name.toLowerCase().replace(' ', '-'))}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <category.icon className={`w-6 h-6 ${category.color}`} />
              <div className="text-left">
                <div className="font-medium text-foreground">{category.name}</div>
                <div className="text-sm text-muted-foreground">{category.count} entries</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Recent Knowledge Updates</h3>
        <div className="space-y-3">
          {[
            { action: 'Added', item: 'Flood Insurance Guidelines 2024', time: '2 hours ago', user: 'Sarah M.' },
            { action: 'Updated', item: 'Auto Insurance Deductibles', time: '5 hours ago', user: 'John D.' },
            { action: 'Reviewed', item: 'State Compliance Requirements', time: '1 day ago', user: 'Mike R.' },
            { action: 'Added', item: 'Cyber Insurance Coverage', time: '2 days ago', user: 'Emily S.' }
          ].map((activity, idx) => (
            <div key={idx} className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${
                  activity.action === 'Added' ? 'bg-green-500' :
                  activity.action === 'Updated' ? 'bg-blue-500' : 'bg-purple-500'
                }`} />
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium">{activity.user}</span> {activity.action.toLowerCase()} 
                  <span className="font-medium"> {activity.item}</span>
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const TrainingDataSection = () => (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">AI Training & Fine-tuning</h3>
          <button className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            <RefreshCw className="w-4 h-4" />
            <span>Retrain Model</span>
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Training Examples</span>
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">12,450</div>
            <div className="text-xs text-muted-foreground mt-1">Question-Answer Pairs</div>
          </div>
          
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Model Accuracy</span>
              <Brain className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">96.7%</div>
            <div className="text-xs text-muted-foreground mt-1">On validation set</div>
          </div>
          
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Last Training</span>
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">3 days</div>
            <div className="text-xs text-muted-foreground mt-1">ago</div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium text-foreground">Training Data Sources</h4>
          <div className="space-y-2">
            {[
              { source: 'Lewis Insurance Policy Database', records: 3420, quality: 98 },
              { source: 'Customer Service Transcripts', records: 8930, quality: 92 },
              { source: 'Claims Processing Records', records: 5670, quality: 95 },
              { source: 'Regulatory Documents', records: 890, quality: 100 },
              { source: 'Industry Best Practices', records: 1230, quality: 94 }
            ].map((source, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-accent rounded-lg">
                <div className="flex items-center space-x-3">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{source.source}</span>
                  <span className="text-sm text-muted-foreground">{source.records.toLocaleString()} records</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">Quality:</span>
                  <div className="w-20 bg-muted rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${source.quality}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{source.quality}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Continuous Learning Enabled</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                The AI Brain automatically learns from new documents, customer interactions, and feedback to improve accuracy over time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">AI Knowledge Brain</h1>
                <p className="text-sm text-muted-foreground">Lewis Insurance Intelligent Knowledge Base</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={handleSyncKnowledge}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Sync Knowledge</span>
              </button>
              <button 
                onClick={() => setIsImporting(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <Upload className="w-4 h-4" />
                <span>Import Knowledge</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: Brain },
              { id: 'policies', label: 'Policies', icon: FileText },
              { id: 'regulations', label: 'Regulations', icon: Scale },
              { id: 'procedures', label: 'Procedures', icon: BookOpen },
              { id: 'products', label: 'Products', icon: Building },
              { id: 'training', label: 'Training Data', icon: Sparkles }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex items-center space-x-2 py-4 border-b-2 transition-colors ${
                  activeSection === tab.id 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search knowledge base..."
            className="w-full pl-12 pr-4 py-3 bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {activeSection === 'overview' && <BrainOverview />}
        {activeSection === 'policies' && (
          <CategorySection 
            title="Insurance Policies"
            icon={FileText}
            entries={knowledgeBase.policies}
            color="bg-blue-600"
          />
        )}
        {activeSection === 'regulations' && (
          <CategorySection 
            title="Regulations & Compliance"
            icon={Scale}
            entries={knowledgeBase.regulations}
            color="bg-purple-600"
          />
        )}
        {activeSection === 'procedures' && (
          <CategorySection 
            title="Standard Procedures"
            icon={BookOpen}
            entries={knowledgeBase.procedures}
            color="bg-green-600"
          />
        )}
        {activeSection === 'products' && (
          <CategorySection 
            title="Insurance Products"
            icon={Building}
            entries={knowledgeBase.products}
            color="bg-orange-600"
          />
        )}
        {activeSection === 'training' && <TrainingDataSection />}
      </div>

      {/* Import Knowledge Dialog */}
      <Dialog open={isImporting} onOpenChange={setIsImporting}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Knowledge Entry</DialogTitle>
            <DialogDescription>
              Add new information to the AI knowledge base with automatic embedding generation
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="import-title">Title</Label>
              <Input
                id="import-title"
                value={importForm.title}
                onChange={(e) => setImportForm({ ...importForm, title: e.target.value })}
                placeholder="e.g., Auto Insurance Guidelines"
              />
            </div>
            
            <div>
              <Label htmlFor="import-category">Category</Label>
              <select
                id="import-category"
                value={importForm.category}
                onChange={(e) => setImportForm({ ...importForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background"
              >
                <option value="general">General</option>
                <option value="policies">Policies</option>
                <option value="procedures">Procedures</option>
                <option value="claims">Claims</option>
                <option value="compliance">Compliance</option>
                <option value="sales">Sales</option>
              </select>
            </div>
            
            <div>
              <Label htmlFor="import-tags">Tags (comma-separated)</Label>
              <Input
                id="import-tags"
                value={importForm.tags}
                onChange={(e) => setImportForm({ ...importForm, tags: e.target.value })}
                placeholder="e.g., insurance, auto, coverage"
              />
            </div>
            
            <div>
              <Label htmlFor="import-source">Source</Label>
              <Input
                id="import-source"
                value={importForm.source}
                onChange={(e) => setImportForm({ ...importForm, source: e.target.value })}
                placeholder="e.g., Policy Manual 2024"
              />
            </div>
            
            <div>
              <Label htmlFor="import-content">Content</Label>
              <Textarea
                id="import-content"
                value={importForm.content}
                onChange={(e) => setImportForm({ ...importForm, content: e.target.value })}
                placeholder="Enter detailed information..."
                rows={10}
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsImporting(false)}
                disabled={loading}
                className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleImportKnowledge}
                disabled={loading || !importForm.title.trim() || !importForm.content.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Import Knowledge</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      {isEditing && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">Edit Knowledge Entry</h2>
                <button
                  onClick={() => setIsEditing(false)}
                  className="p-2 hover:bg-accent rounded-lg"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Title</label>
                <input
                  type="text"
                  value={selectedItem.title}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary bg-background"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Content</label>
                <textarea
                  value={selectedItem.content}
                  rows={6}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary bg-background"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Category</label>
                  <input
                    type="text"
                    value={selectedItem.category}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary bg-background"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Source</label>
                  <input
                    type="text"
                    value={selectedItem.source}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary bg-background"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Tags</label>
                <input
                  type="text"
                  value={selectedItem.tags.join(', ')}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary bg-background"
                  placeholder="Enter tags separated by commas"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4 border-t border-border">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsuranceAIBrain;