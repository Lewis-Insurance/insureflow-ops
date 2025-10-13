import { useParams, Link } from 'react-router-dom';
import { useWorkspaceJobs, Job } from '@/hooks/useWorkspaceJobs';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { activeJobs, historyJobs, loading } = useWorkspaceJobs(id);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Workspace</h1>
          <p className="text-muted-foreground mt-2">
            Monitor your quote comparison jobs and review completed analyses
          </p>
        </div>

        {/* Active Jobs */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Working in background</h2>
          <Card>
            {activeJobs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No active jobs
              </div>
            ) : (
              <div className="divide-y">
                {activeJobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* History */}
        <div>
          <h2 className="text-xl font-semibold mb-4">History</h2>
          <Card>
            {historyJobs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No completed jobs
              </div>
            ) : (
              <div className="divide-y">
                {historyJobs.map((job) => (
                  <JobRow key={job.id} job={job} showActions />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function JobRow({ job, showActions }: { job: Job; showActions?: boolean }) {
  const getStatusBadge = (status: Job['status']) => {
    switch (status) {
      case 'queued':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Queued</Badge>;
      case 'running':
        return <Badge className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge>;
      case 'succeeded':
        return <Badge variant="default" className="flex items-center gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" /> Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>;
      case 'canceled':
        return <Badge variant="outline">Canceled</Badge>;
    }
  };

  return (
    <div className="p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="font-medium truncate">{job.title}</h3>
          {getStatusBadge(job.status)}
        </div>
        <p className="text-sm text-muted-foreground">
          {job.completed_at
            ? `Completed ${formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}`
            : job.started_at
            ? `Started ${formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}`
            : `Created ${formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}`}
        </p>
        {job.error_message && (
          <p className="text-sm text-destructive mt-1">{job.error_message}</p>
        )}
        {job.result_data?.summary && (
          <p className="text-sm text-muted-foreground mt-1">{job.result_data.summary}</p>
        )}
      </div>

      {showActions && job.status === 'succeeded' && job.result_session_id && (
        <Link to={`/comparison-report/${job.result_session_id}`}>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            View Report
          </Button>
        </Link>
      )}
    </div>
  );
}