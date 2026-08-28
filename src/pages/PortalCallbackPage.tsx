import { useEffect, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCEPT_ERROR = 'This portal invitation could not be accepted. Please contact your insurance agency.';

export default function PortalCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationId = searchParams.get('invitation');
  const [error, setError] = useState<string | null>(null);
  const acceptingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    if (!invitationId || !UUID_PATTERN.test(invitationId)) {
      setError(ACCEPT_ERROR);
      return () => {
        mounted = false;
      };
    }

    const accept = async (session: Session | null) => {
      if (!session || acceptingRef.current) return;
      acceptingRef.current = true;

      const { error: acceptError } = await supabase.rpc('accept_portal_invitation', {
        p_invitation_id: invitationId,
      });

      if (!mounted) return;
      if (acceptError) {
        acceptingRef.current = false;
        setError(ACCEPT_ERROR);
        return;
      }

      navigate('/portal/dashboard', { replace: true });
    };

    void supabase.auth.getSession().then(({ data }) => accept(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void accept(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [invitationId, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cc-bg px-6">
      <section className="w-full max-w-md rounded-cc-xl border border-cc-border bg-cc-surface p-8 text-center shadow-cc-md">
        {error ? (
          <div role="alert" aria-live="assertive">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-cc-danger" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-cc-text">Invitation unavailable</h1>
            <p className="mt-3 text-sm text-cc-text-muted">{error}</p>
          </div>
        ) : (
          <div role="status" aria-live="polite">
            <LoaderCircle className="mx-auto mb-4 h-8 w-8 animate-spin text-cc-accent motion-reduce:animate-none" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-cc-text">Setting up your portal</h1>
            <p className="mt-3 text-sm text-cc-text-muted">Please wait while we confirm your invitation.</p>
          </div>
        )}
      </section>
    </main>
  );
}
