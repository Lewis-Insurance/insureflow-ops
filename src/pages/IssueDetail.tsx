import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useIssue,
  useUpdateIssue,
  useAddIssueComment,
  useVoteIssue,
  useHasVoted,
  type IssueStatus,
  type IssueSeverity,
  type IssuePriority,
} from '@/hooks/useIssueTracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ThumbsUp,
  MessageSquare,
  Paperclip,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  Link as LinkIcon,
  Calendar,
  Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { TableSkeleton } from '@/components/ui/skeleton-components';
import { Separator } from '@/components/ui/separator';

export default function IssueDetail() {
  const { issueId } = useParams();
  const navigate = useNavigate();
  const { data: issue, isLoading, error } = useIssue(issueId);
  const { data: hasVoted } = useHasVoted(issueId);
  const updateIssueMutation = useUpdateIssue();
  const addCommentMutation = useAddIssueComment();
  const voteMutation = useVoteIssue();

  const [newComment, setNewComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    status: '',
    severity: '',
    priority: '',
    assigned_to: '',
  });

  const handleVote = async () => {
    if (!issueId) return;
    await voteMutation.mutateAsync({
      issue_id: issueId,
      remove: hasVoted,
    });
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !issueId) return;

    await addCommentMutation.mutateAsync({
      issue_id: issueId,
      comment_text: newComment,
    });

    setNewComment('');
  };

  const handleUpdateStatus = async (status: IssueStatus) => {
    if (!issueId) return;
    await updateIssueMutation.mutateAsync({
      issue_id: issueId,
      updates: { status },
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={5} />;
  }

  if (error || !issue) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Issue</AlertTitle>
        <AlertDescription>{error?.message || 'Issue not found'}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/issues')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Issues
        </Button>

        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-3xl font-bold">
                #{issue.issue_number} {issue.title}
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={
                  issue.status === 'new'
                    ? 'destructive'
                    : issue.status === 'closed'
                    ? 'outline'
                    : 'default'
                }
              >
                {issue.status.replace(/_/g, ' ').toUpperCase()}
              </Badge>
              <Badge
                variant={
                  issue.severity === 'critical'
                    ? 'destructive'
                    : issue.severity === 'high'
                    ? 'default'
                    : 'secondary'
                }
              >
                {issue.severity.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {issue.category.replace(/_/g, ' ')}
              </Badge>
              {issue.is_blocker && (
                <Badge variant="destructive" className="ml-2">
                  BLOCKER
                </Badge>
              )}
              {issue.is_regression && (
                <Badge variant="default" className="ml-2">
                  REGRESSION
                </Badge>
              )}
            </div>
          </div>

          <Button
            variant={hasVoted ? 'default' : 'outline'}
            size="sm"
            onClick={handleVote}
            className="ml-4"
          >
            <ThumbsUp className={`mr-2 h-4 w-4 ${hasVoted ? 'fill-current' : ''}`} />
            {issue.upvotes}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{issue.description}</p>
            </CardContent>
          </Card>

          {/* Steps to Reproduce */}
          {issue.steps_to_reproduce && (
            <Card>
              <CardHeader>
                <CardTitle>Steps to Reproduce</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{issue.steps_to_reproduce}</p>
              </CardContent>
            </Card>
          )}

          {/* Expected vs Actual */}
          {(issue.expected_behavior || issue.actual_behavior) && (
            <Card>
              <CardHeader>
                <CardTitle>Expected vs Actual Behavior</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                {issue.expected_behavior && (
                  <div>
                    <Label className="text-green-600">Expected</Label>
                    <p className="mt-2 text-sm">{issue.expected_behavior}</p>
                  </div>
                )}
                {issue.actual_behavior && (
                  <div>
                    <Label className="text-red-600">Actual</Label>
                    <p className="mt-2 text-sm">{issue.actual_behavior}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Error Message */}
          {issue.error_message && (
            <Card>
              <CardHeader>
                <CardTitle>Error Message</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-sm">
                  {issue.error_message}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Attachments */}
          {issue.attachments && issue.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Attachments ({issue.attachments.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {issue.attachments.map((attachment: any) => (
                    <div
                      key={attachment.id}
                      className="border rounded-lg p-4 flex items-center gap-3"
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{attachment.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(attachment.file_size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle>
                <MessageSquare className="inline mr-2 h-5 w-5" />
                Comments ({issue.comments?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {issue.comments && issue.comments.length > 0 ? (
                issue.comments.map((comment: any) => (
                  <div key={comment.id} className="border-l-2 pl-4 py-2">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4" />
                      <span className="font-medium text-sm">
                        {comment.author?.raw_user_meta_data?.full_name || comment.author?.email}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(comment.created_at), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.comment_text}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet</p>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>Add Comment</Label>
                <Textarea
                  placeholder="Share updates, ask questions, or provide additional information..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={4}
                />
                <Button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Post Comment
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Activity Log */}
          {issue.activity && issue.activity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <Activity className="inline mr-2 h-5 w-5" />
                  Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {issue.activity.map((activity: any) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-2 w-2 bg-primary rounded-full" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium">
                            {activity.user?.raw_user_meta_data?.full_name || 'System'}
                          </span>{' '}
                          <span className="text-muted-foreground">
                            {activity.activity_type.replace(/_/g, ' ')}
                          </span>
                          {activity.old_value && activity.new_value && (
                            <>
                              {' '}
                              from <Badge variant="outline">{activity.old_value}</Badge> to{' '}
                              <Badge variant="outline">{activity.new_value}</Badge>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={issue.status}
                onValueChange={(value) => handleUpdateStatus(value as IssueStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="triaged">Triaged</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="testing">Testing</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="wont_fix">Won't Fix</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reported by</span>
                <span className="font-medium">
                  {issue.reported_by_user?.raw_user_meta_data?.full_name ||
                    issue.reported_by_user?.email}
                </span>
              </div>

              {issue.assigned_to_user && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Assigned to</span>
                  <span className="font-medium">
                    {issue.assigned_to_user.raw_user_meta_data?.full_name ||
                      issue.assigned_to_user.email}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(issue.created_at), 'MMM d, yyyy')}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last updated</span>
                <span>{format(new Date(issue.updated_at), 'MMM d, yyyy')}</span>
              </div>

              {issue.affected_page && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Affected page</span>
                  <span className="flex items-center gap-1 text-xs">
                    <LinkIcon className="h-3 w-3" />
                    {issue.affected_page}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Browser Info */}
          {issue.browser_info && (
            <Card>
              <CardHeader>
                <CardTitle>Environment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {issue.browser_info.platform && (
                  <div>
                    <span className="text-muted-foreground">Platform: </span>
                    <span>{issue.browser_info.platform}</span>
                  </div>
                )}
                {issue.browser_info.screenWidth && (
                  <div>
                    <span className="text-muted-foreground">Screen: </span>
                    <span>
                      {issue.browser_info.screenWidth} x {issue.browser_info.screenHeight}
                    </span>
                  </div>
                )}
                {issue.browser_info.viewportWidth && (
                  <div>
                    <span className="text-muted-foreground">Viewport: </span>
                    <span>
                      {issue.browser_info.viewportWidth} x {issue.browser_info.viewportHeight}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Resolution */}
          {issue.resolution_notes && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-900">
                  <CheckCircle2 className="inline mr-2 h-5 w-5" />
                  Resolution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-green-900">{issue.resolution_notes}</p>
                {issue.resolved_at && (
                  <p className="text-xs text-green-700 mt-2">
                    Resolved {format(new Date(issue.resolved_at), 'MMM d, yyyy')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
