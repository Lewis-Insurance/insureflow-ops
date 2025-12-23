/**
 * Rate Watch List Page
 * 
 * Shows all Rate Watch jobs with status, customer, and quick actions.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  Eye,
  Trash2,
  Loader2,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useRateWatchJobs,
  useDeleteRateWatchJob,
  RATE_WATCH_STATUS_CONFIG,
  RateWatchJob,
} from '@/hooks/useRateWatch';

export default function RateWatchList() {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading, error } = useRateWatchJobs();
  const deleteJob = useDeleteRateWatchJob();

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [jobToDelete, setJobToDelete] = React.useState<RateWatchJob | null>(null);

  const handleDelete = async () => {
    if (jobToDelete) {
      await deleteJob.mutateAsync(jobToDelete.id);
      setDeleteDialogOpen(false);
      setJobToDelete(null);
    }
  };

  const getPremiumChangeIcon = (pct: number | null) => {
    if (pct === null) return null;
    if (pct > 0) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (pct < 0) return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/ao-renewals')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Target className="h-8 w-8" />
                Rate Watch
              </h1>
              <p className="text-muted-foreground">
                Multi-carrier quote comparisons for renewal premium shock
              </p>
            </div>
          </div>
          <Button onClick={() => navigate('/ao-renewals/rate-watch/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Rate Watch
          </Button>
        </div>

        {/* Jobs Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Rate Watch Jobs</CardTitle>
            <CardDescription>
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} total
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                Error loading jobs: {error.message}
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Rate Watch Jobs Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first rate watch to compare renewal premiums with alternative quotes.
                </p>
                <Button onClick={() => navigate('/ao-renewals/rate-watch/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rate Watch
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Name</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Line of Business</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Premium Change</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => {
                    const statusConfig = RATE_WATCH_STATUS_CONFIG[job.status] || RATE_WATCH_STATUS_CONFIG.draft;
                    return (
                      <TableRow
                        key={job.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/ao-renewals/rate-watch/${job.id}`)}
                      >
                        <TableCell className="font-medium">{job.job_name}</TableCell>
                        <TableCell>{job.accounts?.name || 'Unknown'}</TableCell>
                        <TableCell>{job.line_of_business}</TableCell>
                        <TableCell>
                          <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {job.premium_change_pct !== null ? (
                            <div className="flex items-center gap-1">
                              {getPremiumChangeIcon(job.premium_change_pct)}
                              <span className={
                                job.premium_change_pct > 0 ? 'text-red-600' :
                                job.premium_change_pct < 0 ? 'text-green-600' : ''
                              }>
                                {job.premium_change_pct > 0 ? '+' : ''}
                                {job.premium_change_pct}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/ao-renewals/rate-watch/${job.id}`);
                              }}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setJobToDelete(job);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Rate Watch Job?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{jobToDelete?.job_name}" and all associated documents.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteJob.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Delete'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}


