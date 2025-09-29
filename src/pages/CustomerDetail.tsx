import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { ActionMenu } from '@/components/customers/ActionMenu';
import { CustomerContactInfo } from '@/components/customers/CustomerContactInfo';
import { CustomerPoliciesSection } from '@/components/customers/CustomerPoliciesSection';
import { CustomerDocumentsSection } from '@/components/customers/CustomerDocumentsSection';
import { AddNoteModal } from '@/components/customers/AddNoteModal';
import { AddTaskModal } from '@/components/customers/AddTaskModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, FileText, CheckSquare, Plus } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  type: string;
  account_type?: string;
  account_status?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  tin_last4?: string;
  source?: string;
  lead_source_detail?: string;
  notes?: string;
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
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    
  const fetchData = async () => {
    try {
      // Fetch account details
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (accountError) {
        console.error('Account fetch error:', accountError);
        toast({
          title: 'Error',
          description: 'Failed to load customer details: ' + accountError.message,
          variant: 'destructive',
        });
        return;
      }

      if (!accountData) {
        toast({
          title: 'Error',
          description: 'Customer not found',
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
  };

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

        {/* Customer Information Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Comprehensive Contact Information */}
          <CustomerContactInfo account={account} />

          {/* Recent Notes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Notes ({notes.length})
              </CardTitle>
              <Button size="sm" onClick={() => setAddNoteOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Note
              </Button>
            </CardHeader>
            <CardContent>
              {notes.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-3">No notes yet</p>
                  <Button size="sm" onClick={() => setAddNoteOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Note
                  </Button>
                </div>
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
        </div>

        {/* Tasks Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Tasks ({tasks.length})
            </CardTitle>
            <Button size="sm" onClick={() => setAddTaskOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">No tasks yet</p>
                <Button size="sm" onClick={() => setAddTaskOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Task
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tasks.map((task) => (
                  <div key={task.id} className="border rounded-lg p-3">
                    <p className="text-sm font-medium">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        task.status === 'completed' ? 'bg-green-100 text-green-800' :
                        task.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {task.status}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {new Date(task.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Policies & Quotes Section */}
        <CustomerPoliciesSection accountId={account.id} />

        {/* Documents Section */}
        <CustomerDocumentsSection accountId={account.id} />
      </div>
      
      {/* Modals */}
      <AddNoteModal
        open={addNoteOpen}
        onOpenChange={setAddNoteOpen}
        accountId={account.id}
      />
      <AddTaskModal
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        accountId={account.id}
      />
    </AppLayout>
  );
}