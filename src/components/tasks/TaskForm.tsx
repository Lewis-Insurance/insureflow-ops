import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { formatPhoneForDisplay } from '@/lib/format';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { CalendarIcon, Search, X, Loader2 } from 'lucide-react';
import { Task, TaskCategory, TaskPriority, TaskStatus } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

// Zod validation schema for task form
const taskSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  description: z.string().trim().max(2000, 'Description too long (max 2000 characters)').optional().or(z.literal('')),
  category: z.enum(['general', 'quote', 'policy', 'claim', 'renewal', 'service']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  due_at: z.string().optional(),
  assignee_id: z.string().optional(),
  notes: z.string().trim().max(2000, 'Notes too long (max 2000 characters)').optional().or(z.literal('')),
});

type TaskFormValues = z.infer<typeof taskSchema>;

const TZ = 'America/New_York';
interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  accountId?: string;
  onSubmit: (taskData: Partial<Task>) => Promise<void>;
}

export function TaskForm({ open, onOpenChange, task, accountId, onSubmit }: TaskFormProps) {
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Customer/Policy selection state
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<any>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'general',
      priority: 'medium',
      status: 'pending',
      due_at: undefined,
      assignee_id: undefined,
      notes: '',
    },
  });

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (open) {
      if (task) {
        form.reset({
          title: task.title,
          description: task.description || '',
          category: task.category,
          priority: task.priority,
          status: task.status,
          due_at: task.due_at,
          assignee_id: task.assignee_id,
          notes: task.notes || '',
        });
      } else {
        // For new tasks, default to assigning to current user
        form.reset({
          title: '',
          description: '',
          category: 'general',
          priority: 'medium',
          status: 'pending',
          due_at: undefined,
          assignee_id: currentUserId || undefined,
          notes: '',
        });
        // Reset customer/policy selection for new tasks
        setSelectedCustomer(null);
        setSelectedPolicy(null);
        setCustomerSearch('');
      }
    }
  }, [task, open, currentUserId, form]);

  useEffect(() => {
    if (open) {
      fetchStaffMembers();
    }
  }, [open]);

  const fetchStaffMembers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['staff', 'admin'])
      .order('full_name');
    
    setStaffMembers(data || []);
  };

  // Search customers
  useEffect(() => {
    const searchCustomers = async () => {
      if (customerSearch.length < 2) {
        setCustomers([]);
        return;
      }

      setLoadingCustomers(true);
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, email, phone')
          .or(`name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
          .limit(10);

        if (!error) {
          setCustomers(data || []);
        }
      } catch (error) {
        console.error('Error searching customers:', error);
      } finally {
        setLoadingCustomers(false);
      }
    };

    const debounce = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounce);
  }, [customerSearch]);

  // Load policies when customer is selected
  useEffect(() => {
    const loadPolicies = async () => {
      if (!selectedCustomer?.id) {
        setPolicies([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('policies')
          .select('id, policy_number, line_of_business, carrier')
          .eq('account_id', selectedCustomer.id)
          .order('policy_number');

        if (!error) {
          setPolicies(data || []);
        }
      } catch (error) {
        console.error('Error loading policies:', error);
      }
    };

    loadPolicies();
  }, [selectedCustomer]);

  const handleFormSubmit = async (values: TaskFormValues) => {
    setSubmitting(true);

    try {
      const payload: any = { ...values };
      if (accountId) {
        payload.account_id = accountId;
      } else if (selectedCustomer) {
        payload.account_id = selectedCustomer.id;
      }

      // Add customer and policy info to metadata
      if (selectedCustomer || selectedPolicy) {
        payload.metadata = {
          ...payload.metadata,
          customer_name: selectedCustomer?.name,
          customer_email: selectedCustomer?.email,
          customer_phone: selectedCustomer?.phone,
          policy_number: selectedPolicy?.policy_number,
          policy_type: selectedPolicy?.line_of_business,
          carrier: selectedPolicy?.carrier,
        };
      }

      await onSubmit(payload);

      // Reset form
      setSelectedCustomer(null);
      setSelectedPolicy(null);
      setCustomerSearch('');

      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            {/* Customer Selection */}
            {!accountId && (
              <div>
                <FormLabel>Customer / Account</FormLabel>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md mt-2">
                    <div className="flex-1">
                      <div className="font-medium">{selectedCustomer.name}</div>
                      {selectedCustomer.email && (
                        <div className="text-sm text-muted-foreground">{selectedCustomer.email}</div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setSelectedPolicy(null);
                        setPolicies([]);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between mt-2"
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Search for customer...
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search by name, email, or phone..."
                          value={customerSearch}
                          onValueChange={setCustomerSearch}
                        />
                        <CommandList>
                          {loadingCustomers ? (
                            <CommandEmpty>Searching...</CommandEmpty>
                          ) : customers.length === 0 && customerSearch.length >= 2 ? (
                            <CommandEmpty>No customers found</CommandEmpty>
                          ) : customers.length === 0 ? (
                            <CommandEmpty>Type to search customers</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {customers.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.id}
                                  onSelect={() => {
                                    setSelectedCustomer(customer);
                                    setCustomerSearchOpen(false);
                                  }}
                                >
                                  <div>
                                    <div className="font-medium">{customer.name}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {customer.email || formatPhoneForDisplay(customer.phone)}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}

            {/* Policy Selection */}
            {selectedCustomer && policies.length > 0 && (
              <div>
                <FormLabel>Policy (Optional)</FormLabel>
                {selectedPolicy ? (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md mt-2">
                    <div className="flex-1">
                      <div className="font-medium">{selectedPolicy.policy_number}</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedPolicy.line_of_business} - {selectedPolicy.carrier}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedPolicy(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={selectedPolicy?.id}
                    onValueChange={(value) => {
                      const policy = policies.find(p => p.id === value);
                      setSelectedPolicy(policy);
                    }}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select a policy" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      {policies.map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.policy_number} - {policy.line_of_business}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter task title" maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter task description"
                      rows={3}
                      maxLength={2000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="quote">Quote</SelectItem>
                        <SelectItem value="policy">Policy</SelectItem>
                        <SelectItem value="claim">Claim</SelectItem>
                        <SelectItem value="renewal">Renewal</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="assignee_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To</FormLabel>
                    <Select
                      value={field.value || 'unassigned'}
                      onValueChange={(value) => field.onChange(value === 'unassigned' ? undefined : value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {staffMembers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="due_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? formatInTimeZone(new Date(field.value), TZ, 'PPP zzz') : 'Pick a date'}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => {
                          if (!date) {
                            field.onChange(undefined);
                            return;
                          }
                          const ymd = formatInTimeZone(date, TZ, 'yyyy-MM-dd');
                          const iso = fromZonedTime(`${ymd} 12:00:00`, TZ).toISOString();
                          field.onChange(iso);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional notes..."
                      rows={3}
                      maxLength={2000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
