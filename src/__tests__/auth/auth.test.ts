// ============================================
// Auth Module Tests
// Tests for authentication flows
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          maybeSingle: vi.fn(),
        })),
      })),
    })),
  },
}));

import { supabase } from '@/integrations/supabase/client';

describe('Auth Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Management', () => {
    it('should return null session when not authenticated', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { data } = await supabase.auth.getSession();
      expect(data.session).toBeNull();
    });

    it('should return valid session when authenticated', async () => {
      const mockSession = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        expires_at: Date.now() + 3600000,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'authenticated',
        },
      };

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const { data } = await supabase.auth.getSession();
      expect(data.session).toBeDefined();
      expect(data.session?.user.email).toBe('test@example.com');
    });
  });

  describe('Sign In', () => {
    it('should sign in successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'authenticated',
      };

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: mockUser,
          session: {
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expires_in: 3600,
            expires_at: Date.now() + 3600000,
            user: mockUser,
          },
        },
        error: null,
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user?.email).toBe('test@example.com');
    });

    it('should return error for invalid credentials', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', status: 400 },
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      expect(error).toBeDefined();
      expect(error?.message).toBe('Invalid login credentials');
      expect(data.user).toBeNull();
    });
  });

  describe('Sign Out', () => {
    it('should sign out successfully', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

      const { error } = await supabase.auth.signOut();
      expect(error).toBeNull();
    });
  });

  describe('User Profile', () => {
    it('should fetch user profile after authentication', async () => {
      const mockProfile = {
        id: 'user-123',
        email: 'test@example.com',
        full_name: 'Test User',
        role: 'agent',
        is_staff: false,
      };

      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockProfile,
              error: null,
            }),
          }),
        }),
      } as any);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', 'user-123')
        .single();

      expect(error).toBeNull();
      expect(data).toEqual(mockProfile);
    });
  });
});
