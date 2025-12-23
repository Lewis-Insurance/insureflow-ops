/**
 * Lewis AI Hub - Master Dashboard
 * 
 * Central hub for all AI-powered document intelligence modules.
 * Features:
 * - Grid of available AI modules
 * - Quick chat input for general questions
 * - Recent activity/execution history
 * - Settings access for admins
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  Settings,
  Send,
  Plus,
  Clock,
  Sparkles,
  ArrowRight,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  Scale,
  Search,
  FileCheck,
  FileSearch,
  FileDigit,
  Brain,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAIModules, useRecentExecutions } from '@/integrations/supabase/hooks/useAIModules';
import { AIModuleCard, AIModuleCardSkeleton } from '@/components/ai/AIModuleCard';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

// Icon mapping for recent activity
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

// Color classes for status badges
const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  processing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
};

export default function LewisAIHub() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [quickQuestion, setQuickQuestion] = useState('');

  const { data: modules = [], isLoading: modulesLoading } = useAIModules();
  const { data: recentExecutions = [], isLoading: executionsLoading } = useRecentExecutions(8);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner';

  // Group modules by category
  const modulesByCategory = modules.reduce((acc, module) => {
    const category = module.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(module);
    return acc;
  }, {} as Record<string, typeof modules>);

  const handleQuickQuestion = () => {
    if (quickQuestion.trim()) {
      // Navigate to document intelligence with the question
      navigate(`/ai/document-intelligence?q=${encodeURIComponent(quickQuestion)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuickQuestion();
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600">
                <Bot className="h-7 w-7 text-white" />
              </div>
              What can Lewi do for you?
            </h1>
            <p className="text-muted-foreground text-lg">
              Ask Lewi to help with anything you need, from finding information to drafting emails and documents.
            </p>
          </div>
          {isAdmin && (
            <Button variant="outline" size="icon" onClick={() => navigate('/ai/settings')}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Module Grid */}
        <div className="space-y-6">
          {modulesLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <AIModuleCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => (
                <AIModuleCard key={module.id} module={module} />
              ))}
              
              {/* Create Custom Module Card (Admin Only) */}
              {isAdmin && (
                <Card
                  className="cursor-pointer border-dashed border-2 hover:border-primary/50 hover:bg-muted/50 transition-all"
                  onClick={() => navigate('/ai/create-module')}
                >
                  <CardContent className="p-5 flex flex-col items-center justify-center h-full min-h-[160px] text-center">
                    <div className="p-3 rounded-full bg-muted mb-3">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-1">Create Custom Module</h3>
                    <p className="text-sm text-muted-foreground">
                      Build your own AI-powered tool
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Quick Chat Input */}
        <Card className="bg-gradient-to-r from-purple-500/5 to-blue-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-purple-500" />
                <Input
                  placeholder="Ask Lewi anything... (e.g., 'What's the liability limit on the Smith policy?')"
                  value={quickQuestion}
                  onChange={(e) => setQuickQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10 h-12 text-base bg-background"
                />
              </div>
              <Button 
                size="lg" 
                onClick={handleQuickQuestion}
                disabled={!quickQuestion.trim()}
                className="px-6"
              >
                <Send className="h-4 w-4 mr-2" />
                Ask
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/ai/history')}>
              View All
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {executionsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : recentExecutions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No recent activity yet. Try one of the modules above!</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[400px]">
                  <div className="divide-y">
                    {recentExecutions.map((execution: any) => {
                      const IconComponent = execution.module?.icon 
                        ? ICON_MAP[execution.module.icon] || FileText 
                        : FileText;
                      
                      return (
                        <div
                          key={execution.id}
                          className="p-4 hover:bg-muted/50 cursor-pointer transition-colors flex items-center gap-4"
                          onClick={() => navigate(`/ai/execution/${execution.id}`)}
                        >
                          <div className="p-2 rounded-lg bg-muted">
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-medium truncate">
                                {execution.module?.name || execution.module_slug}
                              </span>
                              {execution.account?.name && (
                                <>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-sm text-muted-foreground truncate">
                                    {execution.account.name}
                                  </span>
                                </>
                              )}
                            </div>
                            {execution.result_summary && (
                              <p className="text-sm text-muted-foreground truncate">
                                {execution.result_summary}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge 
                              variant="outline" 
                              className={cn('capitalize', STATUS_COLORS[execution.status])}
                            >
                              {execution.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {execution.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                              {execution.status === 'processing' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              {execution.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(execution.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

