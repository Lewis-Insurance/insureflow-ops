import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { Task, TaskCategory, TaskPriority, TaskStatus } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

const TZ = 'America/New_York';
interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  accountId?: string;
  onSubmit: (taskData: Partial<Task>) => Promise<void>;
}

export function TaskForm({ open, onOpenChange, task, accountId, onSubmit }: TaskFormProps) {
  const [formData, setFormData] = useState<Partial<Task>>({
    title: '',
    description: '',
    category: 'general' as TaskCategory,
    priority: 'medium' as TaskPriority,
    status: 'pending' as TaskStatus,
    due_at: undefined,
    assignee_id: undefined,
    notes: '',
  });
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

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (task) {
      setFormData({
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
      setFormData({
        title: '',
        description: '',
        category: 'general' as TaskCategory,
        priority: 'medium' as TaskPriority,
        status: 'pending' as TaskStatus,
        due_at: undefined,
        assignee_id: currentUserId || undefined,
        notes: '',
      });
      // Reset customer/policy selection for new tasks
      setSelectedCustomer(null);
      setSelectedPolicy(null);
      setCustomerSearch('');
    }
  }, [task, open, currentUserId]);

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
          .select('id, policy_number, policy_type, carrier')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const payload: any = { ...formData };
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
          policy_type: selectedPolicy?.policy_type,
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Selection */}
          {!accountId && (
            <div>
              <Label>Customer / Account</Label>
              {selectedCustomer ? (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
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
                      className="w-full justify-between"
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
                                    {customer.email || customer.phone}
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
              <Label>Policy (Optional)</Label>
              {selectedPolicy ? (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <div className="flex-1">
                    <div className="font-medium">{selectedPolicy.policy_number}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedPolicy.policy_type} - {selectedPolicy.carrier}
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select a policy" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {policies.map((policy) => (
                      <SelectItem key={policy.id} value={policy.id}>
                        {policy.policy_number} - {policy.policy_type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="Enter task title"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter task description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value: TaskCategory) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                  <SelectItem value="claim">Claim</SelectItem>
                  <SelectItem value="renewal">Renewal</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: TaskPriority) => setFormData({ ...formData, priority: value })}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: TaskStatus) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="assignee_id">Assigned To</Label>
              <Select
                value={formData.assignee_id || 'unassigned'}
                onValueChange={(value) => setFormData({ ...formData, assignee_id: value === 'unassigned' ? undefined : value })}
              >
                <SelectTrigger id="assignee_id">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staffMembers.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.due_at ? formatInTimeZone(new Date(formData.due_at), TZ, 'PPP zzz') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.due_at ? new Date(formData.due_at) : undefined}
                  onSelect={(date) => {
                    if (!date) {
                      setFormData({ ...formData, due_at: undefined });
                      return;
                    }
                    const ymd = formatInTimeZone(date, TZ, 'yyyy-MM-dd');
                    const iso = fromZonedTime(`${ymd} 12:00:00`, TZ).toISOString();
                    setFormData({ ...formData, due_at: iso });
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

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
              {submitting ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
