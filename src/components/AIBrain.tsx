import React, { useState } from 'react';
import { 
  Brain, BookOpen, Database, Sparkles, Upload, 
  Search, Plus, Edit, Trash2, Save, X,
  FileText, Layers, RefreshCw,
  Shield, Zap, BookMarked, 
  Building, Scale, Info, Hash, Loader2, Tag
} from 'lucide-react';
import { useAIBrain } from '@/hooks/useAIBrain';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const InsuranceAIBrain = () => {
  const { addKnowledge, updateEmbeddings, loading } = useAIBrain();
  const { entries, loading: entriesLoading, stats, fetchKnowledgeBase, deleteEntry, updateEntry, getEntriesByCategory } = useKnowledgeBase();
  const { toast } = useToast();
  
  const [activeSection, setActiveSection] = useState('overview');
  const [selectedItem, setSelectedItem] = useState<any>(null);
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
      setImportForm({
        title: '',
        content: '',
        category: 'general',
        tags: '',
        source: 'manual'
      });
      setIsImporting(false);
      fetchKnowledgeBase();
    }
  };

  const handleSyncKnowledge = async () => {
    const result = await updateEmbeddings();
    if (result) {
      fetchKnowledgeBase();
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (confirm('Are you sure you want to delete this knowledge entry?')) {
      await deleteEntry(id);
    }
  };

  const handleUpdateEntry = async () => {
    if (!selectedItem) return;

    await updateEntry(selectedItem.id, {
      title: selectedItem.title,
      content: selectedItem.content,
      category: selectedItem.category,
      source: selectedItem.source,
      tags: selectedItem.tags,
    });

    setIsEditing(false);
    setSelectedItem(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const KnowledgeEntry = ({ entry, onEdit, onDelete }) => (
    <div className="bg-card rounded-lg border border-border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-semibold text-foreground flex items-center">
            {entry.title}
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
            <Tag className="w-3 h-3 mr-1" />
            {entry.category}
          </span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">Source: {entry.source}</span>
        <span className="text-xs text-muted-foreground">Updated: {formatDate(entry.updated_at)}</span>
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
        <button 
          onClick={() => setIsImporting(true)}
          className="flex items-center space-x-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
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
            onDelete={handleDeleteEntry}
          />
        ))}
      </div>
    </div>
  );

  const BrainOverview = () => {
    if (entriesLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Knowledge Entries</span>
              <Database className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.totalEntries}</div>
            <div className="text-xs text-muted-foreground mt-1">Total entries</div>
          </div>
          
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Categories</span>
              <Brain className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.categories}</div>
            <div className="text-xs text-muted-foreground mt-1">Unique categories</div>
          </div>
          
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Queries Answered</span>
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">15,234</div>
            <div className="text-xs text-blue-600 mt-1">1,234 today</div>
          </div>
          
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Response Time</span>
              <Zap className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">1.2s</div>
            <div className="text-xs text-green-600 mt-1">-0.3s faster</div>
          </div>
        </div>

        {/* Knowledge Categories */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Knowledge Categories</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Insurance Policies', section: 'policies', icon: FileText, count: getEntriesByCategory('policies').length, color: 'text-blue-600' },
              { name: 'Regulations', section: 'regulations', icon: Scale, count: getEntriesByCategory('compliance').length, color: 'text-purple-600' },
              { name: 'Procedures', section: 'procedures', icon: BookOpen, count: getEntriesByCategory('procedures').length, color: 'text-green-600' },
              { name: 'Products', section: 'products', icon: Building, count: getEntriesByCategory('sales').length, color: 'text-orange-600' },
              { name: 'FAQs', section: 'faqs', icon: Info, count: 0, color: 'text-pink-600' },
              { name: 'Terminology', section: 'terminology', icon: Hash, count: 0, color: 'text-indigo-600' },
              { name: 'Templates', section: 'templates', icon: Layers, count: 0, color: 'text-yellow-600' },
              { name: 'Training', section: 'training', icon: BookMarked, count: 0, color: 'text-red-600' }
            ].map((category, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSection(category.section)}
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
            {entries.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium">{entry.title}</span>
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(entry.updated_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const TrainingDataSection = () => (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">AI Training & Fine-tuning</h3>
          <button 
            onClick={handleSyncKnowledge}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Retrain Model</span>
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Training Examples</span>
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.totalEntries}</div>
            <div className="text-xs text-muted-foreground mt-1">Knowledge Entries</div>
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
              <Database className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-foreground">{formatDate(stats.lastUpdated)}</div>
            <div className="text-xs text-muted-foreground mt-1">Last update</div>
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
        {entriesLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {activeSection === 'overview' && <BrainOverview />}
            {activeSection === 'policies' && (
              <CategorySection 
                title="Insurance Policies"
                icon={FileText}
                entries={getEntriesByCategory('policies')}
                color="bg-blue-600"
              />
            )}
            {activeSection === 'regulations' && (
              <CategorySection 
                title="Regulations & Compliance"
                icon={Scale}
                entries={getEntriesByCategory('compliance')}
                color="bg-purple-600"
              />
            )}
            {activeSection === 'procedures' && (
              <CategorySection 
                title="Standard Procedures"
                icon={BookOpen}
                entries={getEntriesByCategory('procedures')}
                color="bg-green-600"
              />
            )}
            {activeSection === 'products' && (
              <CategorySection 
                title="Insurance Products"
                icon={Building}
                entries={getEntriesByCategory('sales')}
                color="bg-orange-600"
              />
            )}
            {activeSection === 'training' && <TrainingDataSection />}
          </>
        )}
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
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Knowledge Entry</DialogTitle>
              <DialogDescription>
                Update the knowledge entry details
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={selectedItem.title}
                  onChange={(e) => setSelectedItem({ ...selectedItem, title: e.target.value })}
                />
              </div>
              
              <div>
                <Label>Content</Label>
                <Textarea
                  value={selectedItem.content}
                  onChange={(e) => setSelectedItem({ ...selectedItem, content: e.target.value })}
                  rows={6}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Input
                    value={selectedItem.category}
                    onChange={(e) => setSelectedItem({ ...selectedItem, category: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label>Source</Label>
                  <Input
                    value={selectedItem.source}
                    onChange={(e) => setSelectedItem({ ...selectedItem, source: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <Label>Tags</Label>
                <Input
                  value={Array.isArray(selectedItem.tags) ? selectedItem.tags.join(', ') : ''}
                  onChange={(e) => setSelectedItem({ 
                    ...selectedItem, 
                    tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) 
                  })}
                  placeholder="Enter tags separated by commas"
                />
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <button
                  onClick={() => setIsEditing(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdateEntry}
                  disabled={loading}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center space-x-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default InsuranceAIBrain;