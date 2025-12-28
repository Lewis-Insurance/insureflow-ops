import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

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

// types
export type JobRow = Omit<Job, 'input_data' | 'result_data' | 'metadata'> & {
  input_data?: unknown;
  result_data?: unknown;
  metadata?: unknown;
};

export interface JobEvent {
  id: string;
  job_id: string;
  event_type: string;
  message: string;
  details?: any;
  created_at: string;
}

// tiny guards
const asJob = (v: unknown): v is JobRow => !!v && typeof (v).id === 'string';
const asEvent = (v: unknown): v is JobEvent => !!v && typeof (v).id === 'string';

// --- useWorkspaceJobs ---
export function useWorkspaceJobs(workspaceId?: string) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!workspaceId) { setLoading(false); return; }

    let mounted = true;
    const seen = new Set<string>(); // guard against dup inserts on reconnect

    const mergeUpsert = (row: JobRow) => {
      setJobs(prev => {
        const idx = prev.findIndex(j => j.id === row.id);
        if (idx === -1) return [row, ...prev];
        const next = [...prev]; next[idx] = row; return next;
      });
    };

    const fetchJobs = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('jobs')
          .select('id,workspace_id,account_id,job_type,status,title,created_by,created_at,started_at,completed_at,updated_at,result_session_id,error_message,attempts,max_attempts')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(200); // pagination ready
        if (error) throw error;
        if (!mounted) return;
        setJobs((data as JobRow[]) ?? []);
        data?.forEach((j: any) => seen.add(j.id));
      } catch (e) {
        logger.error('fetchJobs', e);
        toast({ title: 'Error', description: 'Failed to load jobs', variant: 'destructive' });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchJobs();

    const channel = supabase
      .channel(`workspace-${workspaceId}-jobs`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'jobs',
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new;
          if (asJob(row)) {
            if (!seen.has(row.id)) { seen.add(row.id); mergeUpsert(row); }
          }
        }
        if (payload.eventType === 'UPDATE') {
          const prev = payload.old as JobRow | undefined;
          const next = payload.new as JobRow | undefined;
          if (!asJob(next)) return;
          mergeUpsert(next);

          // toast only on transition to terminal states
          const was = prev?.status;
          const now = next.status;
          const terminal = (s: JobStatus) => ['succeeded','failed','canceled'].includes(s);
          if (!was || was === now) return;
          if (!terminal(was as JobStatus) && terminal(now as JobStatus)) {
            if (now === 'succeeded') {
              toast({ title: 'Job completed', description: next.title || next.id });
            } else if (now === 'failed') {
              toast({ title: 'Job failed', description: next.error_message || next.title || next.id, variant: 'destructive' });
            }
          }
        }
        if (payload.eventType === 'DELETE') {
          const row = payload.old;
          if (asJob(row)) {
            setJobs(prev => prev.filter(j => j.id !== row.id));
            seen.delete(row.id);
          }
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [workspaceId, toast]);

  const activeJobs = jobs.filter(j => j.status === 'queued' || j.status === 'running');
  const historyJobs = jobs.filter(j => j.status === 'succeeded' || j.status === 'failed' || j.status === 'canceled');

  const refetch = async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from('jobs')
      .select('id,workspace_id,account_id,job_type,status,title,created_by,created_at,started_at,completed_at,updated_at,result_session_id,error_message,attempts,max_attempts')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200);
    setJobs((data as JobRow[]) ?? []);
  };

  return { jobs, activeJobs, historyJobs, loading, refetch };
}

// --- useJobEvents ---
export function useJobEvents(jobId?: string) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) { setLoading(false); return; }
    let mounted = true;
    const seen = new Set<string>();

    const fetchEvents = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('job_events')
          .select('id,job_id,event_type,message,details,created_at')
          .eq('job_id', jobId)
          .order('created_at', { ascending: true })
          .limit(500);
        if (error) throw error;
        if (!mounted) return;
        setEvents((data as JobEvent[]) ?? []);
        data?.forEach((e: any) => seen.add(e.id));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchEvents();

    const channel = supabase
      .channel(`job-${jobId}-events`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_events',
        filter: `job_id=eq.${jobId}`,
      }, (payload) => {
        const row = payload.new;
        if (asEvent(row) && !seen.has(row.id)) {
          seen.add(row.id);
          setEvents(prev => [...prev, row]);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  return { events, loading };
}