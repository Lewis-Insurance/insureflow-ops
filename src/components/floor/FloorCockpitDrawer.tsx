import { useState } from 'react';
import { Bot, CheckCircle2, Edit3, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { validateFloorMessageForModel } from '@/floor/floorSafety';
import { sendFloorChatMessage } from '@/floor/floorChatClient';
import type { FloorChatSender, FloorDecisionPackagePreview, FloorInitialContext } from '@/floor/types';

interface ChatMessage {
  id: string;
  role: 'human' | 'agent' | 'system';
  content: string;
}

interface ToolProgressItem {
  id: string;
  label: string;
  state: 'started' | 'done' | 'failed';
}

export type { FloorChatSender } from '@/floor/types';

interface FloorCockpitDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContext?: FloorInitialContext | null;
  sendMessage?: FloorChatSender;
}

const defaultContext: FloorInitialContext = {
  sessionRef: 'chat:practice-floor-cockpit',
  clientRef: 'client:practice-context',
  label: 'Practice mode',
  chips: [
    { label: 'Mode', value: 'Practice / no live sends' },
    { label: 'Surface', value: 'InsureFlow cockpit' },
  ],
};

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function FloorCockpitDrawer({
  open,
  onOpenChange,
  initialContext,
  sendMessage = sendFloorChatMessage,
}: FloorCockpitDrawerProps) {
  const context = initialContext ?? defaultContext;
  const [input, setInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'floor-welcome',
      role: 'agent',
      content:
        'I am Lewis Floor inside InsureFlow. I can prepare work, show evidence, and create decisions — no client or carrier send happens without named-human approval.',
    },
  ]);
  const [toolProgress, setToolProgress] = useState<ToolProgressItem[]>([]);
  const [packagePreview, setPackagePreview] = useState<FloorDecisionPackagePreview | null>(null);

  async function handleSend() {
    const message = input.trim();
    if (!message || isWorking) return;

    const safety = validateFloorMessageForModel(message);
    if (!safety.ok) {
      setMessages((prev) => [
        ...prev,
        { id: newId('blocked'), role: 'system', content: safety.reason ?? 'Blocked before model.' },
      ]);
      return;
    }

    setInput('');
    setIsWorking(true);
    setPackagePreview(null);
    setToolProgress([]);
    setMessages((prev) => [...prev, { id: newId('human'), role: 'human', content: message }]);

    const assistantMessageId = newId('agent');
    setMessages((prev) => [...prev, { id: assistantMessageId, role: 'agent', content: '' }]);

    try {
      await sendMessage(
        {
          sessionRef: context.sessionRef,
          message,
          contextRefs: {
            clientRef: context.clientRef,
            policyRef: context.policyRef,
            documentRefs: context.documentRefs,
            workItemRef: context.workItemRef,
          },
        },
        (event) => {
          if (event.type === 'tool') {
            setToolProgress((prev) => [...prev, { id: newId('tool'), label: event.label, state: event.state }]);
          }

          if (event.type === 'delta') {
            setMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantMessageId ? { ...entry, content: `${entry.content}${event.delta}` } : entry,
              ),
            );
          }

          if (event.type === 'package') {
            setPackagePreview({
              packageRef: event.packageRef,
              revision: event.revision,
              title: event.title,
              summary: event.summary,
              actions: event.actions,
            });
          }

          if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantMessageId
                  ? { ...entry, content: `Lewis Floor stopped safely: ${event.message}` }
                  : entry,
              ),
            );
          }
        },
      );
    } catch (error) {
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === assistantMessageId
            ? {
                ...entry,
                content: `Lewis Floor is unavailable, and no external action was taken. ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }
            : entry,
        ),
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[440px] flex-col p-0 sm:w-[560px]">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <SheetTitle>Lewis Floor</SheetTitle>
              <SheetDescription>InsureFlow agent cockpit • practice-safe bridge</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="border-b bg-muted/30 px-6 py-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Context
          </div>
          <div className="flex flex-wrap gap-2">
            {context.chips.map((chip) => (
              <Badge key={`${chip.label}:${chip.value}`} variant="secondary" className="max-w-full truncate">
                {`${chip.label}: ${chip.value}`}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Hidden state uses opaque refs only. Approvals and sends stay behind Floor gates.
          </p>
        </div>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'human'
                    ? 'ml-8 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : message.role === 'system'
                      ? 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900'
                      : 'mr-8 rounded-lg border bg-card px-3 py-2 text-sm'
                }
              >
                {message.content || (message.role === 'agent' && isWorking ? 'Working…' : '')}
              </div>
            ))}

            {toolProgress.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Bot className="h-4 w-4" aria-hidden="true" />
                    Tool progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {toolProgress.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      {item.label}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {packagePreview && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{packagePreview.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {packagePreview.packageRef} • revision {packagePreview.revision}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">{packagePreview.summary}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="default" type="button">
                      <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" type="button">
                      <Edit3 className="mr-1 h-4 w-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" type="button">
                      <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                      Kill
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    External send remains disabled in this slice. A named human must approve the exact artifact before any future send/log path can appear.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <label htmlFor="floor-cockpit-message" className="mb-2 block text-sm font-medium">
            Message Lewis Floor
          </label>
          <Textarea
            id="floor-cockpit-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask my agent to prepare the work…"
            className="min-h-24"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">No SSN/DOB/DLN, raw UUIDs, or signed URLs.</p>
            <Button type="button" onClick={handleSend} disabled={isWorking || !input.trim()}>
              Send to Lewis Floor
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
