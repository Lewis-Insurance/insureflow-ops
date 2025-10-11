import React, { useState, useRef, useEffect } from 'react';
import { Brain, Send, Plus, Book, Sparkles, Loader2, ArrowLeft, FileText, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAIBrain } from '@/hooks/useAIBrain';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    id: string;
    title: string;
    category: string;
    similarity: number;
  }>;
  timestamp: Date;
}

export default function InsuranceAIBrain() {
  const navigate = useNavigate();
  const { queryKnowledge, addKnowledge, updateEmbeddings, loading } = useAIBrain();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI-powered knowledge assistant. I can help you find information from your knowledge base about policies, procedures, and more. What would you like to know?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isAddingKnowledge, setIsAddingKnowledge] = useState(false);
  
  // Add Knowledge Form State
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: '',
    content: '',
    category: 'general',
    tags: '',
    source: 'manual'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Query knowledge base
    const result = await queryKnowledge(input);

    if (result) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } else {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error while processing your question. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleAddKnowledge = async () => {
    if (!knowledgeForm.title.trim() || !knowledgeForm.content.trim()) return;

    const tags = knowledgeForm.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    await addKnowledge({
      title: knowledgeForm.title,
      content: knowledgeForm.content,
      category: knowledgeForm.category,
      tags,
      source: knowledgeForm.source
    });

    // Reset form
    setKnowledgeForm({
      title: '',
      content: '',
      category: 'general',
      tags: '',
      source: 'manual'
    });
    setIsAddingKnowledge(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">AI Knowledge Brain</h1>
                <p className="text-sm text-muted-foreground">RAG-powered intelligent search & retrieval</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                onClick={updateEmbeddings}
                disabled={loading}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Update Embeddings
              </Button>
              
              <Dialog open={isAddingKnowledge} onOpenChange={setIsAddingKnowledge}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Knowledge
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add Knowledge Entry</DialogTitle>
                    <DialogDescription>
                      Add new information to the knowledge base with automatic embedding generation
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={knowledgeForm.title}
                        onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
                        placeholder="e.g., Auto Insurance Guidelines"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="category">Category</Label>
                      <select
                        id="category"
                        value={knowledgeForm.category}
                        onChange={(e) => setKnowledgeForm({ ...knowledgeForm, category: e.target.value })}
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
                      <Label htmlFor="tags">Tags (comma-separated)</Label>
                      <Input
                        id="tags"
                        value={knowledgeForm.tags}
                        onChange={(e) => setKnowledgeForm({ ...knowledgeForm, tags: e.target.value })}
                        placeholder="e.g., insurance, auto, coverage"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="content">Content</Label>
                      <Textarea
                        id="content"
                        value={knowledgeForm.content}
                        onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content: e.target.value })}
                        placeholder="Enter detailed information..."
                        rows={10}
                      />
                    </div>
                    
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsAddingKnowledge(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddKnowledge}
                        disabled={loading || !knowledgeForm.title.trim() || !knowledgeForm.content.trim()}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Knowledge
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="h-[calc(100vh-250px)] flex flex-col">
          {/* Messages */}
          <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    {message.role === 'assistant' && (
                      <Brain className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {/* Sources */}
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs font-medium mb-2 flex items-center">
                            <Book className="w-3 h-3 mr-1" />
                            Sources:
                          </p>
                          <div className="space-y-1">
                            {message.sources.map((source) => (
                              <div
                                key={source.id}
                                className="text-xs flex items-center justify-between bg-background/50 rounded p-2"
                              >
                                <div className="flex items-center space-x-2">
                                  <FileText className="w-3 h-3" />
                                  <span>{source.title}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {source.category}
                                  </Badge>
                                </div>
                                <span className="text-muted-foreground">
                                  {(source.similarity * 100).toFixed(0)}% match
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Searching knowledge base...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex items-end space-x-2">
              <div className="flex-1">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask me anything about your knowledge base..."
                  rows={1}
                  className="resize-none"
                />
              </div>
              <Button
                onClick={handleSendMessage}
                disabled={loading || !input.trim()}
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
