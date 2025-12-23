/**
 * ModuleBuilder Page
 * 
 * AI-powered wizard for creating new AI modules through conversation.
 * Users describe what they want, the AI interviews them, then generates
 * a complete module configuration that can be tested and published.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Send, Loader2, Sparkles, TestTube, Rocket,
  Settings, ChevronDown, ChevronUp, Bot, User, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useModuleBuilder, ModuleConfig } from '@/integrations/supabase/hooks/useModuleBuilder';
import ModuleTestPanel from '@/components/ai/ModuleTestPanel';
import ModuleConfigEditor from '@/components/ai/ModuleConfigEditor';

// Icon mapping for preview
import * as Icons from 'lucide-react';

function getIconComponent(iconName: string) {
  const IconComponent = (Icons as any)[iconName];
  return IconComponent || FileText;
}

export default function ModuleBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const improveModuleId = searchParams.get('improve');

  const [inputValue, setInputValue] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    sessionId,
    messages,
    generatedConfig,
    status,
    moduleId,
    isStarting,
    isSending,
    isSaving,
    isPublishing,
    start,
    improve,
    send,
    saveForTesting,
    publishModule,
    reset,
    setGeneratedConfig,
  } = useModuleBuilder();

  // Auto-start session on mount
  useEffect(() => {
    if (!sessionId && !isStarting) {
      if (improveModuleId) {
        improve(improveModuleId);
      } else {
        start();
      }
    }
  }, [sessionId, isStarting, improveModuleId, start, improve]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;

    const message = inputValue;
    setInputValue('');
    await send(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveForTesting = async () => {
    const result = await saveForTesting();
    if (result) {
      setShowTest(true);
    }
  };

  const handlePublish = async () => {
    await publishModule();
    navigate('/ai/hub');
  };

  const handleConfigUpdate = (config: ModuleConfig) => {
    setGeneratedConfig(config);
  };

  // Get preview icon
  const PreviewIcon = generatedConfig
    ? getIconComponent(generatedConfig.icon)
    : FileText;

  return (
    <div className="container max-w-7xl py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/ai/hub')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Lewis AI
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-500" />
              Module Builder
            </h1>
            <p className="text-sm text-muted-foreground">
              {improveModuleId
                ? 'Improve an existing module'
                : 'Create a new AI tool through conversation'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'ready_to_test' && !moduleId && (
            <Badge variant="secondary">Ready to test</Badge>
          )}
          {status === 'testing' && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
              Testing
            </Badge>
          )}
          {status === 'published' && (
            <Badge variant="default" className="bg-green-500">
              Published
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Conversation */}
        <Card className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
          <CardHeader className="pb-3 flex-shrink-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Chat with Lewi
            </CardTitle>
            <CardDescription>
              Describe what you want to build and I'll create it
            </CardDescription>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 pb-4">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex gap-3',
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300'
                      )}
                    >
                      {msg.role === 'user' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </div>

                    {/* Message bubble */}
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-4 py-3',
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                ))}

                {isSending && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="bg-muted rounded-lg px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="mt-4 flex gap-2 flex-shrink-0">
              <Textarea
                placeholder={
                  status === 'published'
                    ? 'Module published!'
                    : 'Describe what you want to build...'
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] max-h-[120px] resize-none"
                disabled={status === 'published'}
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isSending || status === 'published'}
                className="self-end"
                size="icon"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: Config & Actions */}
        <div className="space-y-4">
          {/* Generated Config Preview */}
          {generatedConfig && (
            <Card>
              <Collapsible open={showConfig} onOpenChange={setShowConfig}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-4">
                    {/* Module icon preview */}
                    <div
                      className={cn(
                        'w-12 h-12 rounded-lg flex items-center justify-center',
                        `bg-${generatedConfig.color}-100 text-${generatedConfig.color}-600`,
                        'dark:bg-opacity-20'
                      )}
                      style={{
                        backgroundColor: `var(--${generatedConfig.color}-100, #dbeafe)`,
                        color: `var(--${generatedConfig.color}-600, #2563eb)`,
                      }}
                    >
                      <PreviewIcon className="h-6 w-6" />
                    </div>

                    <div className="flex-1">
                      <CardTitle className="text-lg">{generatedConfig.name}</CardTitle>
                      <CardDescription className="line-clamp-1">
                        {generatedConfig.description}
                      </CardDescription>
                    </div>

                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        {showConfig ? 'Hide' : 'Edit'}
                        {showConfig ? (
                          <ChevronUp className="h-4 w-4 ml-2" />
                        ) : (
                          <ChevronDown className="h-4 w-4 ml-2" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <ScrollArea className="max-h-[400px]">
                      <ModuleConfigEditor
                        config={generatedConfig}
                        onChange={handleConfigUpdate}
                      />
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>

              {!showConfig && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Documents:</span>{' '}
                      <span className="font-medium">
                        {generatedConfig.input_config.min_documents}-
                        {generatedConfig.input_config.max_documents}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category:</span>{' '}
                      <Badge variant="outline" className="capitalize">
                        {generatedConfig.category}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email Draft:</span>{' '}
                      {generatedConfig.output_config.show_email_draft ? '✅' : '❌'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Download:</span>{' '}
                      {generatedConfig.output_config.show_download_report ? '✅' : '❌'}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Action Buttons */}
          {generatedConfig && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {/* Save for Testing */}
                  {!moduleId && (
                    <Button
                      onClick={handleSaveForTesting}
                      disabled={isSaving}
                      className="w-full"
                      variant="outline"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Save & Test Module
                    </Button>
                  )}

                  {/* Test Panel */}
                  {moduleId && (
                    <>
                      <Collapsible open={showTest} onOpenChange={setShowTest}>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full">
                            <TestTube className="h-4 w-4 mr-2" />
                            {showTest ? 'Hide Test Panel' : 'Test Module'}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-4">
                          <ModuleTestPanel moduleId={moduleId} />
                        </CollapsibleContent>
                      </Collapsible>

                      <Separator />

                      {/* Publish */}
                      <Button
                        onClick={handlePublish}
                        disabled={isPublishing || status === 'published'}
                        className="w-full"
                      >
                        {isPublishing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Rocket className="h-4 w-4 mr-2" />
                        )}
                        {status === 'published' ? 'Published!' : 'Publish Module'}
                      </Button>

                      <p className="text-xs text-muted-foreground text-center">
                        Once published, this module will be available to all staff
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions (before config generated) */}
          {!generatedConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  How it works
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
                  <li className="leading-relaxed">
                    <span className="font-medium text-foreground">Describe</span>{' '}
                    what you want the AI tool to do in plain English
                  </li>
                  <li className="leading-relaxed">
                    <span className="font-medium text-foreground">Answer</span>{' '}
                    Lewi's clarifying questions about inputs and outputs
                  </li>
                  <li className="leading-relaxed">
                    <span className="font-medium text-foreground">Review</span>{' '}
                    the generated configuration and make any edits
                  </li>
                  <li className="leading-relaxed">
                    <span className="font-medium text-foreground">Test</span>{' '}
                    with sample documents to verify it works
                  </li>
                  <li className="leading-relaxed">
                    <span className="font-medium text-foreground">Publish</span>{' '}
                    to make it available to your whole team
                  </li>
                </ol>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Example ideas:</h4>
                  <div className="space-y-1">
                    <button
                      className="text-left text-xs text-primary hover:underline block"
                      onClick={() => {
                        setInputValue(
                          'I want a tool that reads loss runs and summarizes claim history for underwriting'
                        );
                      }}
                    >
                      → "Analyze loss runs and summarize claim history"
                    </button>
                    <button
                      className="text-left text-xs text-primary hover:underline block"
                      onClick={() => {
                        setInputValue(
                          'I need a tool to compare two COIs and highlight any differences'
                        );
                      }}
                    >
                      → "Compare two COIs and find differences"
                    </button>
                    <button
                      className="text-left text-xs text-primary hover:underline block"
                      onClick={() => {
                        setInputValue(
                          'Help me create a module that extracts key information from commercial applications'
                        );
                      }}
                    >
                      → "Extract key info from applications"
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

