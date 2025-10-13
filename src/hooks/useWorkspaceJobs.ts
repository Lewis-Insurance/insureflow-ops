import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface Job {
  id: string;
  workspace_id: string;
  account_id?: string;
  job_type: string;
  status: JobStatus;
  title: string;
  created_by?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
  input_data: any;
  result_data?: any;
  result_session_id?: string;
  error_message?: string;
  attempts: number;
  max_attempts: number;
  metadata?: any;
}

export interface JobEvent {
  id: string;
  job_id: string;
  event_type: string;
  message: string;
  details?: any;
  created_at: string;
}

export function useWorkspaceJobs(workspaceId?: string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    fetchJobs();

    // Subscribe to job changes
    const jobsChannel = supabase
      .channel(`workspace-${workspaceId}-jobs`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          console.log('Job change:', payload);
          
          if (payload.eventType === 'INSERT') {
            setJobs((prev) => [payload.new as Job, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setJobs((prev) =>
              prev.map((job) =>
                job.id === payload.new.id ? (payload.new as Job) : job
              )
            );
            
            // Show toast on completion
            const newJob = payload.new as Job;
            if (newJob.status === 'succeeded') {
              toast({
                title: 'Job Completed',
                description: `${newJob.title} has finished processing`,
              });
            } else if (newJob.status === 'failed') {
              toast({
                title: 'Job Failed',
                description: newJob.error_message || `${newJob.title} failed to complete`,
                variant: 'destructive',
              });
            }
          } else if (payload.eventType === 'DELETE') {
            setJobs((prev) => prev.filter((job) => job.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(jobsChannel);
    };
  }, [workspaceId, toast]);

  async function fetchJobs() {
    if (!workspaceId) return;

    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load jobs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const activeJobs = jobs.filter((j) => ['queued', 'running'].includes(j.status));
  const historyJobs = jobs.filter((j) => ['succeeded', 'failed', 'canceled'].includes(j.status));

  return {
    jobs,
    activeJobs,
    historyJobs,
    loading,
    refetch: fetchJobs,
  };
}

export function useJobEvents(jobId?: string) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }

    fetchEvents();

    // Subscribe to new events
    const eventsChannel = supabase
      .channel(`job-${jobId}-events`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_events',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          setEvents((prev) => [...prev, payload.new as JobEvent]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(eventsChannel);
    };
  }, [jobId]);

  async function fetchEvents() {
    if (!jobId) return;

    try {
      const { data, error } = await supabase
        .from('job_events')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  }

  return { events, loading };
}