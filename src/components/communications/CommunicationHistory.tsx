/**
 * Communication History Component
 *
 * Displays communication history with an account including:
 * - Email, SMS, portal messages
 * - Engagement metrics (opened, clicked, replied)
 * - AI-generated vs manual
 * - Timeline view
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mail,
  MessageSquare,
  Phone,
  Users,
  CheckCircle2,
  Eye,
  MousePointer,
  Reply,
  Sparkles,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  useCommunicationHistory,
  useCommunicationEngagementStats,
  type CommunicationHistory as CommunicationHistoryType,
  type CommunicationType,
  type CommunicationStatus,
} from '@/hooks/useEmailComposer';
import { formatDistanceToNow } from 'date-fns';

interface CommunicationHistoryProps {
  accountId: string;
}

export function CommunicationHistory({ accountId }: CommunicationHistoryProps) {
  const { data: communications, isLoading } = useCommunicationHistory(accountId);
  const { data: engagementStats } = useCommunicationEngagementStats(accountId);
  const [selectedType, setSelectedType] = useState<CommunicationType | 'all'>('all');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Loading communication history...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const filteredCommunications = selectedType === 'all'
    ? communications
    : communications?.filter((c) => c.communication_type === selectedType);

  return (
    <div className="space-y-4">
      {/* Engagement Stats */}
      {engagementStats && engagementStats.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          {engagementStats.map((stat: any) => (
            <Card key={stat.communication_type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {getCommunicationIcon(stat.communication_type)}
                  {stat.communication_type.charAt(0).toUpperCase() + stat.communication_type.slice(1).replace('_', ' ')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.total_communications}</div>
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  {stat.open_rate !== null && (
                    <div>Open Rate: {stat.open_rate}%</div>
                  )}
                  {stat.reply_rate !== null && (
                    <div>Reply Rate: {stat.reply_rate}%</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Communication List */}
      <Card>
        <CardHeader>
          <CardTitle>Communication Timeline</CardTitle>
          <CardDescription>
            All interactions with this customer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedType} onValueChange={(value) => setSelectedType(value as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
              <TabsTrigger value="portal_message">Portal</TabsTrigger>
              <TabsTrigger value="phone">Phone</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedType} className="space-y-4">
              {filteredCommunications && filteredCommunications.length > 0 ? (
                filteredCommunications.map((comm) => (
                  <CommunicationItem key={comm.id} communication={comm} />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No communications yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function CommunicationItem({ communication }: { communication: CommunicationHistoryType }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-4 space-y-3 hover:bg-accent/50 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className="mt-1">
            {getCommunicationIcon(communication.communication_type)}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {communication.subject || `${communication.communication_type.replace('_', ' ')} message`}
              </span>

              {communication.ai_generated && (
                <Badge variant="secondary" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI
                </Badge>
              )}

              <Badge variant={getStatusVariant(communication.status)}>
                {communication.status}
              </Badge>
            </div>

            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(communication.created_at), { addSuffix: true })}
              {communication.tone_used && ` • ${communication.tone_used} tone`}
            </div>
          </div>
        </div>

        {/* Engagement Indicators */}
        <div className="flex gap-2 text-xs">
          {communication.opened_at && (
            <div className="flex items-center gap-1 text-blue-600">
              <Eye className="h-3 w-3" />
              {communication.open_count > 1 && communication.open_count}
            </div>
          )}
          {communication.click_count > 0 && (
            <div className="flex items-center gap-1 text-green-600">
              <MousePointer className="h-3 w-3" />
              {communication.click_count}
            </div>
          )}
          {communication.replied_at && (
            <div className="flex items-center gap-1 text-purple-600">
              <Reply className="h-3 w-3" />
            </div>
          )}
        </div>
      </div>

      {/* Preview/Expanded Body */}
      <div className="text-sm">
        {expanded ? (
          <div className="whitespace-pre-wrap bg-muted/30 rounded p-3">
            {communication.message_body}
          </div>
        ) : (
          <div className="text-muted-foreground line-clamp-2">
            {communication.message_body}
          </div>
        )}

        <Button
          variant="link"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="h-auto p-0 text-xs mt-1"
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      </div>

      {/* Compliance & Context */}
      {expanded && (
        <div className="space-y-2 pt-2 border-t">
          {communication.compliance_checked && (
            <div className="flex items-center gap-2 text-xs">
              {communication.compliance_passed ? (
                <CheckCircle2 className="h-3 w-3 text-green-600" />
              ) : (
                <AlertCircle className="h-3 w-3 text-yellow-600" />
              )}
              <span className="text-muted-foreground">
                Compliance: {communication.compliance_passed ? 'Passed' : 'Review needed'}
              </span>
            </div>
          )}

          {communication.ai_confidence_score && (
            <div className="text-xs text-muted-foreground">
              AI Confidence: {communication.ai_confidence_score}%
            </div>
          )}

          {communication.context_data && Object.keys(communication.context_data).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View context data
              </summary>
              <pre className="mt-2 bg-muted/30 rounded p-2 overflow-x-auto">
                {JSON.stringify(communication.context_data, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function getCommunicationIcon(type: CommunicationType) {
  switch (type) {
    case 'email':
      return <Mail className="h-4 w-4 text-blue-600" />;
    case 'sms':
      return <MessageSquare className="h-4 w-4 text-green-600" />;
    case 'portal_message':
      return <FileText className="h-4 w-4 text-purple-600" />;
    case 'phone':
      return <Phone className="h-4 w-4 text-orange-600" />;
    case 'in_person':
      return <Users className="h-4 w-4 text-gray-600" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
}

function getStatusVariant(status: CommunicationStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'sent':
    case 'delivered':
      return 'default';
    case 'opened':
    case 'clicked':
    case 'replied':
      return 'secondary';
    case 'draft':
    case 'scheduled':
      return 'outline';
    case 'bounced':
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}
