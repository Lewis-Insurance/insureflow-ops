import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Phone, Mail, MessageSquare, Video, Plus, Clock, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  useRenewalContacts,
  useLogRenewalContact,
  ContactType,
  ContactDirection,
  RenewalContact,
} from '@/hooks/useRenewalWorkflow';

interface RenewalContactLogProps {
  renewalId: string;
}

const CONTACT_TYPES: { value: ContactType; label: string; icon: React.ElementType }[] = [
  { value: 'call', label: 'Phone Call', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS/Text', icon: MessageSquare },
  { value: 'meeting', label: 'Meeting', icon: Video },
  { value: 'other', label: 'Other', icon: Clock },
];

const OUTCOMES = [
  'Left voicemail',
  'Spoke with customer',
  'Sent information',
  'Scheduled follow-up',
  'No answer',
  'Wrong number',
  'Customer will call back',
  'Other',
];

function getContactIcon(type: ContactType) {
  const config = CONTACT_TYPES.find((t) => t.value === type);
  const Icon = config?.icon || Phone;
  return <Icon className="h-4 w-4" />;
}

function getContactLabel(type: ContactType) {
  return CONTACT_TYPES.find((t) => t.value === type)?.label || type;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function RenewalContactLog({ renewalId }: RenewalContactLogProps) {
  const { data: contacts, isLoading, error } = useRenewalContacts(renewalId);
  const logContact = useLogRenewalContact();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newContact, setNewContact] = useState<{
    contact_type: ContactType;
    direction: ContactDirection;
    outcome: string;
    notes: string;
    duration_minutes: string;
  }>({
    contact_type: 'call',
    direction: 'outbound',
    outcome: '',
    notes: '',
    duration_minutes: '',
  });

  const handleAddContact = () => {
    logContact.mutate(
      {
        renewalId,
        contact_type: newContact.contact_type,
        direction: newContact.direction,
        outcome: newContact.outcome || undefined,
        notes: newContact.notes || undefined,
        duration_minutes: newContact.duration_minutes
          ? parseInt(newContact.duration_minutes)
          : undefined,
      },
      {
        onSuccess: () => {
          setShowAddModal(false);
          setNewContact({
            contact_type: 'call',
            direction: 'outbound',
            outcome: '',
            notes: '',
            duration_minutes: '',
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contact Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          <p>Failed to load contact log</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Contact Log</CardTitle>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Log Contact
          </Button>
        </CardHeader>
        <CardContent>
          {contacts && contacts.length > 0 ? (
            <div className="space-y-4">
              {contacts.map((contact) => (
                <ContactEntry key={contact.id} contact={contact} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No contacts logged</p>
              <p className="text-sm mt-1">Start logging your contact attempts</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Contact Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Log Contact</DialogTitle>
            <DialogDescription>
              Record a contact attempt with the customer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Contact Type */}
            <div className="space-y-2">
              <Label>Contact Type</Label>
              <Select
                value={newContact.contact_type}
                onValueChange={(value) =>
                  setNewContact((prev) => ({ ...prev, contact_type: value as ContactType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <span className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Direction */}
            <div className="space-y-2">
              <Label>Direction</Label>
              <RadioGroup
                value={newContact.direction}
                onValueChange={(value) =>
                  setNewContact((prev) => ({ ...prev, direction: value as ContactDirection }))
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="outbound" id="dir-outbound" />
                  <Label htmlFor="dir-outbound" className="font-normal cursor-pointer flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />
                    Outbound (I contacted them)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="inbound" id="dir-inbound" />
                  <Label htmlFor="dir-inbound" className="font-normal cursor-pointer flex items-center gap-1">
                    <ArrowDownLeft className="h-3 w-3" />
                    Inbound (They contacted us)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Duration (for calls/meetings) */}
            {(newContact.contact_type === 'call' || newContact.contact_type === 'meeting') && (
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="0"
                  placeholder="5"
                  value={newContact.duration_minutes}
                  onChange={(e) =>
                    setNewContact((prev) => ({ ...prev, duration_minutes: e.target.value }))
                  }
                />
              </div>
            )}

            {/* Outcome */}
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select
                value={newContact.outcome}
                onValueChange={(value) =>
                  setNewContact((prev) => ({ ...prev, outcome: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((outcome) => (
                    <SelectItem key={outcome} value={outcome}>
                      {outcome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional details..."
                rows={3}
                value={newContact.notes}
                onChange={(e) =>
                  setNewContact((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddContact} disabled={logContact.isPending}>
              {logContact.isPending ? 'Saving...' : 'Log Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContactEntry({ contact }: { contact: RenewalContact }) {
  return (
    <div className="flex gap-4 p-4 rounded-lg border bg-card">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="text-xs">
          {getInitials(contact.author?.full_name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">
            {contact.author?.full_name || contact.author?.email || 'Unknown'}
          </span>
          <Badge variant="outline" className="flex items-center gap-1">
            {getContactIcon(contact.contact_type)}
            {getContactLabel(contact.contact_type)}
          </Badge>
          <Badge
            variant="secondary"
            className={
              contact.direction === 'outbound'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
            }
          >
            {contact.direction === 'outbound' ? (
              <ArrowUpRight className="h-3 w-3 mr-1" />
            ) : (
              <ArrowDownLeft className="h-3 w-3 mr-1" />
            )}
            {contact.direction}
          </Badge>
          {contact.duration_minutes && (
            <Badge variant="outline">
              <Clock className="h-3 w-3 mr-1" />
              {contact.duration_minutes} min
            </Badge>
          )}
        </div>

        {contact.outcome && (
          <p className="text-sm font-medium text-muted-foreground mt-1">
            Outcome: {contact.outcome}
          </p>
        )}

        {contact.notes && (
          <p className="text-sm text-muted-foreground mt-1">{contact.notes}</p>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          {format(new Date(contact.contacted_at), 'MMM d, yyyy h:mm a')}
          {' · '}
          {formatDistanceToNow(new Date(contact.contacted_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
