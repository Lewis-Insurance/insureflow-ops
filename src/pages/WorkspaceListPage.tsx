import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WorkspaceListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    async function getOrCreateWorkspace() {
      try {
        // Try to get existing workspace
        const { data: workspaces, error: fetchError } = await supabase
          .from('workspaces')
          .select('id')
          .limit(1)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (workspaces?.id) {
          // Navigate to existing workspace
          navigate(`/workspace/${workspaces.id}`, { replace: true });
          return;
        }

        // Create new workspace
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: newWorkspace, error: createError } = await supabase
          .from('workspaces')
          .insert({
            name: 'Default Workspace',
            description: 'Insurance comparison workspace',
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) throw createError;

        navigate(`/workspace/${newWorkspace.id}`, { replace: true });
      } catch (error) {
        console.error('Workspace error:', error);
        toast({
          title: 'Error',
          description: 'Failed to load workspace. Please run the database migration first.',
          variant: 'destructive',
        });
      }
    }

    getOrCreateWorkspace();
  }, [navigate, toast]);

  return (
    <AppLayout>
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </AppLayout>
  );
}