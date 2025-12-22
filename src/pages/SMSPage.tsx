import { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  useSMSConversations, 
  useSMSConversation, 
  useSMSStats,
  useSendSMS,
  useBulkLinkSMS,
  type SMSConversation,
  type SMSMessage 
} from '@/hooks/useSMSMessages';
import { useAccounts } from '@/hooks/useCRMData';
import {
  MessageSquare,
  Send,
  Search,
  Phone,
  User,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  MoreVertical,
  Link2,
  Plus,
  Inbox,
  SendHorizontal,
  MessageCircle,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

export default function SMSPage() {
  const [selectedConversation, setSelectedConversation] = useState<SMSConversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showNewMessageDialog, setShowNewMessageDialog] = useState(false);
  const [newMessagePhone, setNewMessagePhone] = useState('');
  const [newMessageText, setNewMessageText] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading: loadingConversations } = useSMSConversations();
  const { data: stats } = useSMSStats();
  const { data: conversationMessages, isLoading: loadingMessages } = useSMSConversation(
    selectedConversation?.phone_number || null
  );
  const { data: accounts } = useAccounts();
  const sendSMS = useSendSMS();
  const bulkLink = useBulkLinkSMS();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages]);

  // Filter conversations by search
  const filteredConversations = conversations?.filter(conv => {
    const searchLower = searchQuery.toLowerCase();
    return (
      conv.phone_number.includes(searchQuery) ||
      conv.contact_name?.toLowerCase().includes(searchLower) ||
      conv.account_name?.toLowerCase().includes(searchLower) ||
      conv.last_message.body.toLowerCase().includes(searchLower)
    );
  });

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConversation) return;

    await sendSMS.mutateAsync({
      to_number: selectedConversation.phone_number,
      body: messageText,
      account_id: selectedConversation.account_id,
      contact_id: selectedConversation.contact_id,
    });

    setMessageText('');
  };

  const handleSendNewMessage = async () => {
    if (!newMessageText.trim() || !newMessagePhone.trim()) return;

    await sendSMS.mutateAsync({
      to_number: newMessagePhone,
      body: newMessageText,
    });

    setNewMessagePhone('');
    setNewMessageText('');
    setShowNewMessageDialog(false);
  };

  const handleLinkToAccount = async () => {
    if (!selectedConversation || !selectedAccountId) return;

    await bulkLink.mutateAsync({
      phoneNumber: selectedConversation.phone_number,
      accountId: selectedAccountId,
    });

    setShowLinkDialog(false);
    setSelectedAccountId('');
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'sent':
      case 'queued':
        return <Clock className="h-3 w-3 text-blue-500" />;
      case 'failed':
      case 'undelivered':
        return <XCircle className="h-3 w-3 text-red-500" />;
      default:
        return <MessageCircle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <MessageSquare className="h-8 w-8" />
                SMS Messages
              </h1>
              <p className="text-muted-foreground">
                Manage text message conversations with your customers
              </p>
            </div>
            <Button onClick={() => setShowNewMessageDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Message
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-6 gap-4 mt-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{stats?.total || 0}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats?.inbound || 0}</div>
              <div className="text-xs text-muted-foreground">Received</div>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats?.outbound || 0}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats?.delivered || 0}</div>
              <div className="text-xs text-muted-foreground">Delivered</div>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{stats?.failed || 0}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="text-center p-3 bg-purple-500/10 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{stats?.today || 0}</div>
              <div className="text-xs text-muted-foreground">Today</div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Conversations List */}
          <div className="w-96 border-r flex flex-col bg-muted/30">
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {loadingConversations ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredConversations?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Inbox className="h-12 w-12 mb-4 opacity-50" />
                  <p className="font-medium">No conversations</p>
                  <p className="text-sm">Messages will appear here</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredConversations?.map((conv) => (
                    <div
                      key={conv.phone_number}
                      className={cn(
                        "p-4 cursor-pointer transition-colors hover:bg-accent/50",
                        selectedConversation?.phone_number === conv.phone_number && "bg-accent"
                      )}
                      onClick={() => setSelectedConversation(conv)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {conv.contact_name ? (
                            <User className="h-5 w-5 text-primary" />
                          ) : (
                            <Phone className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium truncate">
                              {conv.contact_name || conv.phone_number}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          {conv.account_name && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {conv.account_name}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {conv.last_message.direction === 'outbound' && (
                              <span className="text-blue-500 mr-1">You:</span>
                            )}
                            {conv.last_message.body}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {conv.unread_count > 0 && (
                            <Badge className="bg-primary">{conv.unread_count}</Badge>
                          )}
                          {!conv.account_id && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                              Unlinked
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Conversation View */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Conversation Header */}
                <div className="p-4 border-b flex items-center justify-between bg-background">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                      onClick={() => setSelectedConversation(null)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      {selectedConversation.contact_name ? (
                        <User className="h-5 w-5 text-primary" />
                      ) : (
                        <Phone className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {selectedConversation.contact_name || selectedConversation.phone_number}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {selectedConversation.phone_number}
                        {selectedConversation.account_name && (
                          <>
                            <span>•</span>
                            <Building2 className="h-3 w-3" />
                            {selectedConversation.account_name}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedConversation.account_id && (
                      <Button variant="outline" size="sm" onClick={() => setShowLinkDialog(true)}>
                        <Link2 className="h-4 w-4 mr-2" />
                        Link to Customer
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setShowLinkDialog(true)}>
                          <Link2 className="h-4 w-4 mr-2" />
                          Link to Customer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {conversationMessages?.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[70%] rounded-2xl px-4 py-2",
                              msg.direction === 'outbound'
                                ? 'bg-primary text-primary-foreground rounded-br-md'
                                : 'bg-muted rounded-bl-md'
                            )}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                            <div className={cn(
                              "flex items-center gap-1 mt-1 text-xs",
                              msg.direction === 'outbound' 
                                ? 'text-primary-foreground/70 justify-end' 
                                : 'text-muted-foreground'
                            )}>
                              <span>{format(new Date(msg.created_at), 'h:mm a')}</span>
                              {msg.direction === 'outbound' && getStatusIcon(msg.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>

                {/* Message Input */}
                <div className="p-4 border-t bg-background">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type a message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      className="min-h-[44px] max-h-32 resize-none"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={!messageText.trim() || sendSMS.isPending}
                      size="icon"
                      className="h-[44px] w-[44px]"
                    >
                      {sendSMS.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="h-16 w-16 mb-4 opacity-50" />
                <h3 className="text-xl font-medium">Select a conversation</h3>
                <p className="text-sm">Choose a conversation from the list to view messages</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Link to Customer Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Customer</DialogTitle>
            <DialogDescription>
              Link all messages from {selectedConversation?.phone_number} to a customer account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Account</label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleLinkToAccount} disabled={!selectedAccountId || bulkLink.isPending}>
              {bulkLink.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Link Messages
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Message Dialog */}
      <Dialog open={showNewMessageDialog} onOpenChange={setShowNewMessageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              Send a new text message to a phone number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone Number</label>
              <Input
                placeholder="+1 (555) 123-4567"
                value={newMessagePhone}
                onChange={(e) => setNewMessagePhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea
                placeholder="Type your message..."
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewMessageDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendNewMessage} 
              disabled={!newMessagePhone.trim() || !newMessageText.trim() || sendSMS.isPending}
            >
              {sendSMS.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

