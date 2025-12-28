// ============================================
// Producer Collaboration Hook
// Enables real-time collaboration on ACORD forms
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';

// ============================================
// TYPES
// ============================================

export interface Collaborator {
  userId: string;
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  role: CollaboratorRole;
  status: 'online' | 'away' | 'offline';
  lastActive: string;
  currentField?: string;
  cursorPosition?: { x: number; y: number };
}

export type CollaboratorRole = 'owner' | 'editor' | 'viewer' | 'reviewer';

export interface CollaborationSession {
  formId: string;
  formNumber: string;
  accountName: string;
  collaborators: Collaborator[];
  lockedFields: FieldLock[];
  pendingChanges: PendingChange[];
  version: number;
}

export interface FieldLock {
  fieldName: string;
  lockedBy: string;
  lockedByName: string;
  lockedAt: string;
  expiresAt: string;
}

export interface PendingChange {
  id: string;
  fieldName: string;
  oldValue: any;
  newValue: any;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface CollaborationComment {
  id: string;
  formId: string;
  fieldName?: string;
  sectionNumber?: number;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  replies: CollaborationReply[];
}

export interface CollaborationReply {
  id: string;
  commentId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface UseFormCollaborationReturn {
  session: CollaborationSession | null;
  collaborators: Collaborator[];
  isConnected: boolean;
  error: string | null;

  // Session management
  joinSession: (formId: string) => Promise<boolean>;
  leaveSession: () => void;

  // Field locking
  lockField: (fieldName: string) => Promise<boolean>;
  unlockField: (fieldName: string) => Promise<boolean>;
  isFieldLocked: (fieldName: string) => FieldLock | null;

  // Presence
  updatePresence: (fieldName?: string) => void;
  getActiveCollaborators: () => Collaborator[];

  // Comments
  addComment: (content: string, fieldName?: string, sectionNumber?: number) => Promise<string | null>;
  replyToComment: (commentId: string, content: string) => Promise<boolean>;
  resolveComment: (commentId: string) => Promise<boolean>;
  getComments: (fieldName?: string) => Promise<CollaborationComment[]>;

  // Change requests (for reviewer workflow)
  requestChange: (fieldName: string, newValue: any, reason?: string) => Promise<boolean>;
  approveChange: (changeId: string) => Promise<boolean>;
  rejectChange: (changeId: string, reason?: string) => Promise<boolean>;
}

// ============================================
// CONSTANTS
// ============================================

const LOCK_DURATION_MS = 30000; // 30 seconds
const PRESENCE_UPDATE_INTERVAL_MS = 10000; // 10 seconds
const AWAY_THRESHOLD_MS = 60000; // 1 minute

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useFormCollaboration(): UseFormCollaborationReturn {
  const [session, setSession] = useState<CollaborationSession | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentFormIdRef = useRef<string | null>(null);
  const currentUserRef = useRef<any>(null);

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  const joinSession = useCallback(async (formId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      currentUserRef.current = user;
      currentFormIdRef.current = formId;

      // Get form details
      const { data: form, error: formError } = await supabase
        .from('acord_forms')
        .select(`
          *,
          template:template_id(form_number),
          account:account_id(business_name)
        `)
        .eq('id', formId)
        .single();

      if (formError) throw formError;

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      // Set up realtime channel
      const channel = supabase.channel(`form-${formId}`, {
        config: {
          presence: {
            key: user.id,
          },
        },
      });

      // Handle presence sync
      channel.on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        updateCollaboratorsFromPresence(presenceState);
      });

      // Handle presence join
      channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        toast({
          title: 'Collaborator joined',
          description: `${newPresences[0]?.userName || 'Someone'} joined the form`,
        });
      });

      // Handle presence leave
      channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        toast({
          title: 'Collaborator left',
          description: `${leftPresences[0]?.userName || 'Someone'} left the form`,
        });
      });

      // Handle field lock broadcasts
      channel.on('broadcast', { event: 'field_lock' }, ({ payload }) => {
        handleFieldLockBroadcast(payload);
      });

      // Handle field update broadcasts
      channel.on('broadcast', { event: 'field_update' }, ({ payload }) => {
        handleFieldUpdateBroadcast(payload);
      });

      // Subscribe and track presence
      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            oderId: user.id,
            userName: profile?.full_name || user.email,
            userEmail: user.email,
            avatarUrl: profile?.avatar_url,
            role: 'editor', // Would be determined by permissions
            status: 'online',
            lastActive: new Date().toISOString(),
          });
        }
      });

      channelRef.current = channel;

      // Initialize session
      setSession({
        formId,
        formNumber: (form.template as any)?.form_number,
        accountName: (form.account as any)?.business_name,
        collaborators: [],
        lockedFields: [],
        pendingChanges: [],
        version: form.row_version,
      });

      setIsConnected(true);

      // Start presence update interval
      presenceIntervalRef.current = setInterval(() => {
        updatePresence();
      }, PRESENCE_UPDATE_INTERVAL_MS);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join session';
      setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const leaveSession = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.untrack();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (presenceIntervalRef.current) {
      clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = null;
    }

    currentFormIdRef.current = null;
    setSession(null);
    setCollaborators([]);
    setIsConnected(false);
  }, []);

  // ============================================
  // PRESENCE
  // ============================================

  const updatePresence = useCallback((fieldName?: string) => {
    if (!channelRef.current || !currentUserRef.current) return;

    channelRef.current.track({
      userId: currentUserRef.current.id,
      status: 'online',
      lastActive: new Date().toISOString(),
      currentField: fieldName,
    });
  }, []);

  const updateCollaboratorsFromPresence = (presenceState: Record<string, any[]>) => {
    const newCollaborators: Collaborator[] = [];
    const now = Date.now();

    for (const [key, presences] of Object.entries(presenceState)) {
      const presence = presences[0];
      if (!presence) continue;

      const lastActive = new Date(presence.lastActive).getTime();
      let status: Collaborator['status'] = 'online';

      if (now - lastActive > AWAY_THRESHOLD_MS) {
        status = 'away';
      }

      newCollaborators.push({
        userId: presence.userId || key,
        userName: presence.userName || 'Unknown',
        userEmail: presence.userEmail || '',
        avatarUrl: presence.avatarUrl,
        role: presence.role || 'viewer',
        status,
        lastActive: presence.lastActive,
        currentField: presence.currentField,
        cursorPosition: presence.cursorPosition,
      });
    }

    setCollaborators(newCollaborators);
    setSession(prev => prev ? { ...prev, collaborators: newCollaborators } : null);
  };

  const getActiveCollaborators = useCallback((): Collaborator[] => {
    return collaborators.filter(c => c.status !== 'offline');
  }, [collaborators]);

  // ============================================
  // FIELD LOCKING
  // ============================================

  const lockField = useCallback(async (fieldName: string): Promise<boolean> => {
    if (!session || !currentUserRef.current || !channelRef.current) return false;

    try {
      // Check if already locked by someone else
      const existingLock = session.lockedFields.find(l => l.fieldName === fieldName);
      if (existingLock && existingLock.lockedBy !== currentUserRef.current.id) {
        toast({
          title: 'Field locked',
          description: `This field is being edited by ${existingLock.lockedByName}`,
          variant: 'destructive',
        });
        return false;
      }

      const lock: FieldLock = {
        fieldName,
        lockedBy: currentUserRef.current.id,
        lockedByName: currentUserRef.current.email,
        lockedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + LOCK_DURATION_MS).toISOString(),
      };

      // Broadcast lock
      await channelRef.current.send({
        type: 'broadcast',
        event: 'field_lock',
        payload: { action: 'lock', lock },
      });

      setSession(prev => prev ? {
        ...prev,
        lockedFields: [...prev.lockedFields.filter(l => l.fieldName !== fieldName), lock],
      } : null);

      return true;
    } catch (error) {
      logger.error('Failed to lock field:', error);
      return false;
    }
  }, [session, toast]);

  const unlockField = useCallback(async (fieldName: string): Promise<boolean> => {
    if (!session || !currentUserRef.current || !channelRef.current) return false;

    try {
      // Broadcast unlock
      await channelRef.current.send({
        type: 'broadcast',
        event: 'field_lock',
        payload: { action: 'unlock', fieldName, unlockedBy: currentUserRef.current.id },
      });

      setSession(prev => prev ? {
        ...prev,
        lockedFields: prev.lockedFields.filter(l => l.fieldName !== fieldName),
      } : null);

      return true;
    } catch (error) {
      logger.error('Failed to unlock field:', error);
      return false;
    }
  }, [session]);

  const isFieldLocked = useCallback((fieldName: string): FieldLock | null => {
    if (!session) return null;

    const lock = session.lockedFields.find(l => l.fieldName === fieldName);
    if (!lock) return null;

    // Check if lock has expired
    if (new Date(lock.expiresAt) < new Date()) {
      return null;
    }

    // Don't count as locked if current user owns the lock
    if (lock.lockedBy === currentUserRef.current?.id) {
      return null;
    }

    return lock;
  }, [session]);

  const handleFieldLockBroadcast = (payload: any) => {
    if (payload.action === 'lock') {
      setSession(prev => prev ? {
        ...prev,
        lockedFields: [
          ...prev.lockedFields.filter(l => l.fieldName !== payload.lock.fieldName),
          payload.lock,
        ],
      } : null);
    } else if (payload.action === 'unlock') {
      setSession(prev => prev ? {
        ...prev,
        lockedFields: prev.lockedFields.filter(l => l.fieldName !== payload.fieldName),
      } : null);
    }
  };

  const handleFieldUpdateBroadcast = (payload: any) => {
    // Handle real-time field updates from other collaborators
    toast({
      title: 'Field updated',
      description: `${payload.userName} updated ${payload.fieldName}`,
    });
  };

  // ============================================
  // COMMENTS
  // ============================================

  const addComment = useCallback(async (
    content: string,
    fieldName?: string,
    sectionNumber?: number
  ): Promise<string | null> => {
    if (!currentFormIdRef.current || !currentUserRef.current) return null;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUserRef.current.id)
        .single();

      const { data, error } = await supabase
        .from('form_comments')
        .insert({
          form_id: currentFormIdRef.current,
          field_name: fieldName,
          section_number: sectionNumber,
          content,
          author_id: currentUserRef.current.id,
          author_name: profile?.full_name || currentUserRef.current.email,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Comment added',
        description: 'Your comment has been added',
      });

      return data.id;
    } catch (error) {
      logger.error('Failed to add comment:', error);
      return null;
    }
  }, [toast]);

  const replyToComment = useCallback(async (
    commentId: string,
    content: string
  ): Promise<boolean> => {
    if (!currentUserRef.current) return false;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUserRef.current.id)
        .single();

      const { error } = await supabase
        .from('form_comment_replies')
        .insert({
          comment_id: commentId,
          content,
          author_id: currentUserRef.current.id,
          author_name: profile?.full_name || currentUserRef.current.email,
        });

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Failed to reply to comment:', error);
      return false;
    }
  }, []);

  const resolveComment = useCallback(async (commentId: string): Promise<boolean> => {
    if (!currentUserRef.current) return false;

    try {
      const { error } = await supabase
        .from('form_comments')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: currentUserRef.current.id,
        })
        .eq('id', commentId);

      if (error) throw error;

      toast({
        title: 'Comment resolved',
        description: 'The comment has been marked as resolved',
      });

      return true;
    } catch (error) {
      logger.error('Failed to resolve comment:', error);
      return false;
    }
  }, [toast]);

  const getComments = useCallback(async (fieldName?: string): Promise<CollaborationComment[]> => {
    if (!currentFormIdRef.current) return [];

    try {
      let query = supabase
        .from('form_comments')
        .select(`
          *,
          replies:form_comment_replies(*)
        `)
        .eq('form_id', currentFormIdRef.current)
        .is('resolved_at', null)
        .order('created_at', { ascending: false });

      if (fieldName) {
        query = query.eq('field_name', fieldName);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(c => ({
        id: c.id,
        formId: c.form_id,
        fieldName: c.field_name,
        sectionNumber: c.section_number,
        content: c.content,
        authorId: c.author_id,
        authorName: c.author_name,
        createdAt: c.created_at,
        resolvedAt: c.resolved_at,
        resolvedBy: c.resolved_by,
        replies: (c.replies || []).map((r: any) => ({
          id: r.id,
          commentId: r.comment_id,
          content: r.content,
          authorId: r.author_id,
          authorName: r.author_name,
          createdAt: r.created_at,
        })),
      }));
    } catch (error) {
      logger.error('Failed to get comments:', error);
      return [];
    }
  }, []);

  // ============================================
  // CHANGE REQUESTS (Reviewer Workflow)
  // ============================================

  const requestChange = useCallback(async (
    fieldName: string,
    newValue: any,
    reason?: string
  ): Promise<boolean> => {
    if (!currentFormIdRef.current || !currentUserRef.current) return false;

    try {
      // Get current value
      const { data: form } = await supabase
        .from('acord_forms')
        .select('field_values')
        .eq('id', currentFormIdRef.current)
        .single();

      const oldValue = form?.field_values?.[fieldName];

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUserRef.current.id)
        .single();

      const { error } = await supabase
        .from('form_change_requests')
        .insert({
          form_id: currentFormIdRef.current,
          field_name: fieldName,
          old_value: oldValue,
          new_value: newValue,
          reason,
          requested_by: currentUserRef.current.id,
          requested_by_name: profile?.full_name || currentUserRef.current.email,
          status: 'pending',
        });

      if (error) throw error;

      toast({
        title: 'Change requested',
        description: 'Your change request has been submitted for approval',
      });

      return true;
    } catch (error) {
      logger.error('Failed to request change:', error);
      return false;
    }
  }, [toast]);

  const approveChange = useCallback(async (changeId: string): Promise<boolean> => {
    if (!currentUserRef.current) return false;

    try {
      // Get change request
      const { data: change, error: fetchError } = await supabase
        .from('form_change_requests')
        .select('*')
        .eq('id', changeId)
        .single();

      if (fetchError) throw fetchError;

      // Apply the change to the form
      const { data: form } = await supabase
        .from('acord_forms')
        .select('field_values')
        .eq('id', change.form_id)
        .single();

      const updatedValues = {
        ...form?.field_values,
        [change.field_name]: change.new_value,
      };

      const { error: updateError } = await supabase
        .from('acord_forms')
        .update({ field_values: updatedValues })
        .eq('id', change.form_id);

      if (updateError) throw updateError;

      // Mark change as approved
      const { error: approveError } = await supabase
        .from('form_change_requests')
        .update({
          status: 'approved',
          reviewed_by: currentUserRef.current.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', changeId);

      if (approveError) throw approveError;

      toast({
        title: 'Change approved',
        description: 'The change has been applied to the form',
      });

      return true;
    } catch (error) {
      logger.error('Failed to approve change:', error);
      return false;
    }
  }, [toast]);

  const rejectChange = useCallback(async (
    changeId: string,
    reason?: string
  ): Promise<boolean> => {
    if (!currentUserRef.current) return false;

    try {
      const { error } = await supabase
        .from('form_change_requests')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_by: currentUserRef.current.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', changeId);

      if (error) throw error;

      toast({
        title: 'Change rejected',
        description: 'The change request has been rejected',
      });

      return true;
    } catch (error) {
      logger.error('Failed to reject change:', error);
      return false;
    }
  }, [toast]);

  // ============================================
  // CLEANUP
  // ============================================

  useEffect(() => {
    return () => {
      leaveSession();
    };
  }, [leaveSession]);

  return {
    session,
    collaborators,
    isConnected,
    error,

    // Session management
    joinSession,
    leaveSession,

    // Field locking
    lockField,
    unlockField,
    isFieldLocked,

    // Presence
    updatePresence,
    getActiveCollaborators,

    // Comments
    addComment,
    replyToComment,
    resolveComment,
    getComments,

    // Change requests
    requestChange,
    approveChange,
    rejectChange,
  };
}

export default useFormCollaboration;
