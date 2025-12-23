import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Sparkles,
    Send,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    FileText,
    RefreshCw,
    Rocket
} from 'lucide-react';
import { useModuleBuilder, type BuilderMessage, type ModuleConfig } from '@/hooks/useModuleBuilder';
import { cn } from '@/lib/utils';

// Message bubble component
function MessageBubble({ message }: { message: BuilderMessage }) {
    const isUser = message.role === 'user';

    return (
        <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[80%] rounded-xl px-4 py-3',
                    isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                )}
            >
                {!isUser && (
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">Lewi</span>
                    </div>
                )}
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
            </div>
        </div>
    );
}

// Config Preview component
function ConfigPreview({ config }: { config: ModuleConfig }) {
    return (
        <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <CardTitle className="text-lg">Configuration Ready</CardTitle>
                    </div>
                    <Badge variant="secondary">{config.category}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div>
                    <h4 className="font-semibold text-lg">{config.name}</h4>
                    <p className="text-sm text-muted-foreground">{config.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-muted-foreground">Documents:</span>
                        <span className="ml-2">
                            {config.input_config.min_documents || 1} - {config.input_config.max_documents || 3}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Output:</span>
                        <span className="ml-2 capitalize">{config.output_config.format}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function ModuleBuilderPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const improveModuleId = searchParams.get('improve');

    const {
        sessionId,
        messages,
        generatedConfig,
        status,
        moduleId,
        initError,
        isStarting,
        isSending,
        isSaving,
        isPublishing,
        start,
        improve,
        send,
        save,
        publish,
        reset,
    } = useModuleBuilder();

    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-start session on mount
    useEffect(() => {
        if (!sessionId && !isStarting && !initError) {
            if (improveModuleId) {
                improve(improveModuleId).catch(() => { });
            } else {
                start().catch(() => { });
            }
        }
    }, [sessionId, isStarting, initError, improveModuleId, start, improve]);

    const handleSend = async () => {
        if (!inputValue.trim() || isSending) return;
        const message = inputValue.trim();
        setInputValue('');
        await send(message);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSaveAndTest = async () => {
        const result = await save();
        if (result?.module_id) {
            // Navigate to test the module
            navigate(`/lewi-ai?module=${result.module.slug}`);
        }
    };

    const handlePublish = async () => {
        await publish();
        navigate('/lewi-ai');
    };

    // Error state
    if (initError) {
        return (
            <AppLayout>
                <div className="container max-w-4xl py-12">
                    <Card>
                        <CardContent className="py-12 text-center">
                            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                            <h2 className="text-xl font-semibold mb-2">Failed to Start Module Builder</h2>
                            <p className="text-muted-foreground mb-4">
                                The AI service is not available. This might be because the edge function hasn't been deployed yet.
                            </p>
                            <Button onClick={() => { reset(); start(); }}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Try Again
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="container max-w-6xl py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                        <Sparkles className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Module Builder</h1>
                        <p className="text-muted-foreground">
                            Create a new AI tool through conversation
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Chat Panel */}
                    <Card className="flex flex-col h-[600px]">
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-purple-500" />
                                <CardTitle>Chat with Lewi</CardTitle>
                            </div>
                            <CardDescription>
                                Describe what you want to build and I'll create it
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col min-h-0">
                            {/* Messages */}
                            <ScrollArea className="flex-1 pr-4">
                                <div className="space-y-4">
                                    {isStarting ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : (
                                        messages.map((msg, idx) => (
                                            <MessageBubble key={idx} message={msg} />
                                        ))
                                    )}
                                    {isSending && (
                                        <div className="flex justify-start">
                                            <div className="bg-muted rounded-xl px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    <span className="text-sm text-muted-foreground">Thinking...</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </ScrollArea>

                            {/* Input */}
                            <div className="mt-4 flex gap-2">
                                <Input
                                    ref={inputRef}
                                    placeholder="Describe what you want to build..."
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={isStarting || isSending}
                                />
                                <Button
                                    size="icon"
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isSending}
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Info Panel */}
                    <div className="space-y-6">
                        {/* How it works */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-amber-500" />
                                    <CardTitle>How it works</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex gap-3">
                                    <span className="font-medium text-muted-foreground">1.</span>
                                    <span><strong>Describe</strong> what you want the AI tool to do in plain English</span>
                                </div>
                                <div className="flex gap-3">
                                    <span className="font-medium text-muted-foreground">2.</span>
                                    <span><strong>Answer</strong> Lewi's clarifying questions about inputs and outputs</span>
                                </div>
                                <div className="flex gap-3">
                                    <span className="font-medium text-muted-foreground">3.</span>
                                    <span><strong>Review</strong> the generated configuration and make any edits</span>
                                </div>
                                <div className="flex gap-3">
                                    <span className="font-medium text-muted-foreground">4.</span>
                                    <span><strong>Test</strong> with sample documents to verify it works</span>
                                </div>
                                <div className="flex gap-3">
                                    <span className="font-medium text-muted-foreground">5.</span>
                                    <span><strong>Publish</strong> to make it available to your whole team</span>
                                </div>

                                <div className="pt-4 border-t mt-4">
                                    <p className="text-muted-foreground mb-2">Example ideas:</p>
                                    <ul className="space-y-1 text-muted-foreground">
                                        <li>→ "Analyze loss runs and summarize claim history"</li>
                                        <li>→ "Compare two COIs and find differences"</li>
                                        <li>→ "Extract key info from applications"</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Config Preview (when ready) */}
                        {generatedConfig && (
                            <ConfigPreview config={generatedConfig} />
                        )}

                        {/* Action Buttons */}
                        {status === 'ready_to_test' && (
                            <div className="flex gap-3">
                                <Button
                                    className="flex-1"
                                    onClick={handleSaveAndTest}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <FileText className="h-4 w-4 mr-2" />
                                    )}
                                    Save & Test
                                </Button>
                            </div>
                        )}

                        {status === 'testing' && moduleId && (
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => navigate(`/lewi-ai?module=${generatedConfig?.slug}`)}
                                >
                                    <ArrowRight className="h-4 w-4 mr-2" />
                                    Continue Testing
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={handlePublish}
                                    disabled={isPublishing}
                                >
                                    {isPublishing ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Rocket className="h-4 w-4 mr-2" />
                                    )}
                                    Publish
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
