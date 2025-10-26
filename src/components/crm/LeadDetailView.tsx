import { useLead, useUpdateLead, useDeleteLead, useUsers } from '@/hooks/useLeads';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Mail, Phone, MapPin, Calendar, Trash2, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface LeadDetailViewProps {
  leadId: string;
  onClose: () => void;
}

export function LeadDetailView({ leadId, onClose }: LeadDetailViewProps) {
  const { data: lead, isLoading, error } = useLead(leadId);
  const { data: users } = useUsers();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const handleAssignmentChange = (userId: string) => {
    if (userId === 'unassigned') {
      updateLead.mutate({
        id: leadId,
        assigned_to: null,
      });
    } else {
      updateLead.mutate({
        id: leadId,
        assigned_to: userId,
      });
    }
  };

  const handleStatusChange = (status: string) => {
    updateLead.mutate({
      id: leadId,
      status,
    });
  };

  const handleDelete = async () => {
    await deleteLead.mutateAsync(leadId);
    onClose();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-destructive font-semibold">Error loading lead</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error instanceof Error ? error.message : 'Lead not found'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">
              {lead.first_name} {lead.last_name}
            </h2>
            <div className="flex items-center gap-2">
              <Badge className="capitalize">{lead.status}</Badge>
              <Badge variant="secondary">Score: {lead.lead_score}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled>
              <Edit className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this lead? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Assign To</label>
                <Select
                  value={lead.assigned_to || 'unassigned'}
                  onValueChange={handleAssignmentChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={lead.status} onValueChange={handleStatusChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="quoted">Quoted</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="nurturing">Nurturing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lead.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${lead.email}`} className="text-sm hover:underline">
                        {lead.email}
                      </a>
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${lead.phone}`} className="text-sm hover:underline">
                        {lead.phone}
                      </a>
                    </div>
                  )}
                  {lead.address_line1 && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="text-sm">
                        <p>{lead.address_line1}</p>
                        {lead.address_line2 && <p>{lead.address_line2}</p>}
                        {(lead.city || lead.state || lead.zip_code) && (
                          <p>
                            {lead.city}
                            {lead.city && lead.state && ', '}
                            {lead.state} {lead.zip_code}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {!lead.email && !lead.phone && !lead.address_line1 && (
                    <p className="text-sm text-muted-foreground">No contact information available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Insurance Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Insurance Types</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {lead.insurance_types && lead.insurance_types.length > 0 ? (
                        lead.insurance_types.map((type) => (
                          <Badge key={type} variant="outline" className="capitalize">
                            {type}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Not specified</span>
                      )}
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Current Premium</p>
                      <p className="text-lg font-semibold">
                        {lead.current_premium
                          ? `$${lead.current_premium.toLocaleString()}/year`
                          : 'Not provided'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Decision Timeframe</p>
                      <p className="text-lg font-semibold capitalize">
                        {lead.decision_timeframe?.replace(/_/g, ' ') || 'Unknown'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lead Source</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{lead.source?.name || 'Unknown'}</p>
                  {lead.source?.description && (
                    <p className="text-sm text-muted-foreground mt-1">{lead.source.description}</p>
                  )}
                </CardContent>
              </Card>

              {lead.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created:</span>
                    <span>{format(new Date(lead.created_at), 'PPp')}</span>
                  </div>
                  {lead.updated_at && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Updated:</span>
                      <span>{format(new Date(lead.updated_at), 'PPp')}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Log</CardTitle>
                </CardHeader>
                <CardContent>
                  {lead.activities && lead.activities.length > 0 ? (
                    <div className="space-y-4">
                      {lead.activities.map((activity: any) => (
                        <div key={activity.id} className="flex gap-3 pb-4 border-b last:border-0">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium">{activity.title}</p>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground">{activity.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(activity.created_at), 'PPp')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No activity recorded yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  {lead.notes ? (
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap">{lead.notes}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No notes added yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
