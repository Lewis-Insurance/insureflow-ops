import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { ActionMenu } from '@/components/customers/ActionMenu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  type: string;
  email?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

interface Note {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  due_at?: string;
  created_at: string;
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    
    async function fetchData() {
      try {
        // Fetch account details
        const { data: accountData, error: accountError } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', id)
          .single();

        if (accountError) {
          toast({
            title: 'Error',
            description: 'Failed to load customer details',
            variant: 'destructive',
          });
          return;
        }

        setAccount(accountData);

        // Fetch notes
        const { data: notesData } = await supabase
          .from('notes')
          .select('*')
          .eq('account_id', id)
          .order('created_at', { ascending: false });

        setNotes(notesData || []);

        // Fetch tasks
        const { data: tasksData } = await supabase
          .from('tasks')
          .select('*')
          .eq('account_id', id)
          .order('created_at', { ascending: false });

        setTasks(tasksData || []);
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load customer data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id, toast]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-8">
          <div>Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => navigate('/customers')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Customers
          </Button>
          <div className="text-center py-8">
            <h2 className="text-lg font-semibold">Customer not found</h2>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/customers')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">{account.name}</h1>
              <p className="text-muted-foreground capitalize">{account.type} Customer</p>
            </div>
          </div>
          <ActionMenu account={{ id: account.id, name: account.name }} />
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {account.email && (
                <div>
                  <span className="text-sm font-medium">Email:</span>
                  <p className="text-sm">{account.email}</p>
                </div>
              )}
              {account.phone && (
                <div>
                  <span className="text-sm font-medium">Phone:</span>
                  <p className="text-sm">{account.phone}</p>
                </div>
              )}
              <div>
                <span className="text-sm font-medium">Created:</span>
                <p className="text-sm">{new Date(account.created_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Notes ({notes.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet</p>
              ) : (
                <div className="space-y-3">
                  {notes.slice(0, 3).map((note) => (
                    <div key={note.id} className="border-l-2 border-primary/20 pl-3">
                      <p className="text-sm">{note.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                  {notes.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{notes.length - 3} more notes
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks ({tasks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks yet</p>
              ) : (
                <div className="space-y-3">
                  {tasks.slice(0, 3).map((task) => (
                    <div key={task.id}>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {task.status} • {new Date(task.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                  {tasks.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{tasks.length - 3} more tasks
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}