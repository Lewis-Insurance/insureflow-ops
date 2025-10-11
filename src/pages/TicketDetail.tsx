import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTickets } from '@/hooks/useTickets';
import { useTicketMessages } from '@/hooks/useTicketMessages';
import { ArrowLeft, Send, Brain, Sparkles, CheckCircle2, Clock, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useAIAssistantContext } from '@/contexts/AIAssistantContext';

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openSidebar } = useAIAssistantContext();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [aiActions, setAiActions] = useState<any[]>([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  
  const { 
    messages, 
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    addMessage 
  } = useTicketMessages(id);
  const { updateTicket } = useTickets();

  useEffect(() => {
    if (!id) return;
    
    const fetchTicket = async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          accounts(name, email, phone),
          contacts(first_name, last_name, email),
          profiles!tickets_assigned_to_fkey(full_name)
        `)
        .eq('id', id)
        .single();

      if (error) {
        toast({ title: 'Error loading ticket', description: error.message, variant: 'destructive' });
        return;
      }
      setTicket(data);
      setLoading(false);
    };

    const fetchAIActions = async () => {
      const { data } = await supabase
        .from('ticket_actions')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: false });
      setAiActions(data || []);
    };

    fetchTicket();
    fetchAIActions();
  }, [id, toast]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !id) return;

    await addMessage({
      ticket_id: id,
      author_type: 'agent',
      message_type: 'comment',
      content: newMessage,
      is_internal: false,
    });

    setNewMessage('');
  };

  const handleGenerateAISummary = async () => {
    if (!id) return;
    setGeneratingAI(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-ticket-automation', {
        body: {
          action: 'summarize',
          ticketId: id,
          messages: messages.map(m => ({ role: m.author_type, content: m.content })),
        },
      });

      if (error) throw error;

      await supabase.from('ticket_actions').insert({
        ticket_id: id,
        action_type: 'ai_summary',
        content: data.summary,
        metadata: { generated_at: new Date().toISOString() },
      });

      toast({ title: 'AI Summary Generated', description: 'Review the summary below' });
      
      // Refresh AI actions
      const { data: actions } = await supabase
        .from('ticket_actions')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: false });
      setAiActions(actions || []);
    } catch (error: any) {
      toast({ title: 'Failed to generate summary', description: error.message, variant: 'destructive' });
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleGenerateDraftResponse = async () => {
    if (!id) return;
    setGeneratingAI(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-ticket-automation', {
        body: {
          action: 'draft_response',
          ticketId: id,
          messages: messages.map(m => ({ role: m.author_type, content: m.content })),
          ticketContext: {
            subject: ticket.subject,
            accountName: ticket.accounts?.name,
          },
        },
      });

      if (error) throw error;

      await supabase.from('ticket_actions').insert({
        ticket_id: id,
        action_type: 'ai_draft_response',
        content: data.draftResponse,
        metadata: { generated_at: new Date().toISOString() },
      });

      toast({ title: 'Draft Response Generated', description: 'Review and edit the draft below' });
      
      const { data: actions } = await supabase
        .from('ticket_actions')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: false });
      setAiActions(actions || []);
    } catch (error: any) {
      toast({ title: 'Failed to generate draft', description: error.message, variant: 'destructive' });
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleApproveDraft = async (actionId: string, content: string) => {
    if (!id) return;

    await addMessage({
      ticket_id: id,
      author_type: 'agent',
      message_type: 'comment',
      content: content,
      is_internal: false,
    });

    await supabase
      .from('ticket_actions')
      .update({ is_approved: true, approved_at: new Date().toISOString() })
      .eq('id', actionId);

    toast({ title: 'Response sent', description: 'Draft approved and sent to customer' });
  };

  if (loading || !ticket) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <div className="text-center py-8">Loading ticket...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/tickets')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold">{ticket.ticket_number}</h1>
                <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>
                  {ticket.status.replace('_', ' ')}
                </Badge>
                <Badge variant={ticket.priority === 'urgent' ? 'destructive' : 'secondary'}>
                  {ticket.priority}
                </Badge>
              </div>
              <h2 className="text-xl text-muted-foreground">{ticket.subject}</h2>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => openSidebar({
              type: 'account',
              id: ticket.id,
              name: ticket.ticket_number,
              metadata: { ticketId: ticket.id, subject: ticket.subject },
            })}
          >
            <Brain className="h-4 w-4 mr-2" />
            AI Assistant
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ticket Info */}
          <Card>
            <CardHeader>
              <CardTitle>Ticket Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Customer</label>
                <p className="font-medium">{ticket.accounts?.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Contact</label>
                <p>{ticket.contacts ? `${ticket.contacts.first_name} ${ticket.contacts.last_name}` : 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <Select
                  value={ticket.status}
                  onValueChange={(value) => updateTicket({ id: ticket.id, updates: { status: value as any } })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="waiting_customer">Waiting Customer</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Priority</label>
                <Select
                  value={ticket.priority}
                  onValueChange={(value) => updateTicket({ id: ticket.id, updates: { priority: value as any } })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Source</label>
                <p className="capitalize">{ticket.source}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <p>{formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</p>
              </div>
            </CardContent>
          </Card>

          {/* Messages & AI Actions */}
          <div className="lg:col-span-2 space-y-4">
            {/* AI Actions Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    AI Assistance
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateAISummary}
                      disabled={generatingAI}
                    >
                      {generatingAI ? 'Generating...' : 'Summarize'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerateDraftResponse}
                      disabled={generatingAI}
                    >
                      {generatingAI ? 'Generating...' : 'Draft Response'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {aiActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No AI actions yet. Click the buttons above to generate summaries or draft responses.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {aiActions.map((action) => (
                      <div key={action.id} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant="secondary">
                            {action.action_type.replace('ai_', '').replace('_', ' ')}
                          </Badge>
                          {!action.is_approved && action.action_type === 'ai_draft_response' && (
                            <Button
                              size="sm"
                              onClick={() => handleApproveDraft(action.id, action.content)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve & Send
                            </Button>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{action.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Conversation */}
            <Card>
              <CardHeader>
                <CardTitle>Conversation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No messages yet. Start the conversation below.
                    </p>
                  ) : (
                    <>
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${message.author_type === 'ai' ? 'bg-primary/5 -mx-6 px-6 py-3' : ''}`}
                        >
                          <div className="flex-shrink-0">
                            {message.author_type === 'ai' ? (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Brain className="h-4 w-4 text-primary" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {message.profiles?.full_name || message.author_type}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                              </span>
                              {message.is_internal && (
                                <Badge variant="outline" className="text-xs">Internal</Badge>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      ))}
                      
                      {hasNextPage && (
                        <div className="flex justify-center py-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchNextPage()}
                            disabled={isFetchingNextPage}
                          >
                            <Clock className="h-4 w-4 mr-2" />
                            {isFetchingNextPage ? 'Loading...' : 'Load Earlier Messages'}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="min-h-[80px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Tip: Press Ctrl/Cmd+Enter to send
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
