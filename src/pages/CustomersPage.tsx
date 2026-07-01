import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/layout/AppLayout';
import { ActionMenu } from '@/components/customers/ActionMenu';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import { useUnifiedCustomers } from '@/hooks/useUnifiedCustomers';
import { useTags } from '@/hooks/useTags';
import { formatDistanceToNow } from 'date-fns';

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  // Use unified customers hook that works with the accounts table
  const { customers, loading, fetchCustomers } = useUnifiedCustomers();
  const { tags, seedDefaultTags } = useTags();  // Remove mock account ID for now

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCustomerAdded = () => {
    setSearchQuery('');
    fetchCustomers('');
  };

  // Debounced search - waits 300ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchCustomers(searchQuery);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
              <p className="text-muted-foreground">Manage your customer relationships</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded"></div>
                    <div className="h-3 bg-muted rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
            <p className="text-muted-foreground">
              Manage your customer relationships and opportunities
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => seedDefaultTags()}>
              <Plus className="mr-2 h-4 w-4" />
              Setup Tags
            </Button>
            <Button onClick={() => setAddCustomerOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
              <p className="text-xs text-muted-foreground">
                +{Math.floor(customers.length * 0.1)} from last month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {customers.filter(c => c.status === 'active').length}
              </div>
              <p className="text-xs text-muted-foreground">
                {customers.length > 0 ? Math.round((customers.filter(c => c.status === 'active').length / customers.length) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Leads</CardTitle>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {customers.filter(c => c.status?.toLowerCase().includes('lead')).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Pending follow-up
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Customer List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {customers.map((customer) => (
            <Card key={customer.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <Link to={`/customers/${customer.id}`}>
                      <CardTitle className="text-lg hover:text-primary transition-colors cursor-pointer">
                        {customer.display_name || customer.name}
                      </CardTitle>
                    </Link>
                    <CardDescription className="text-sm">
                      {customer.type} • {customer.status}
                    </CardDescription>
                  </div>
                  <ActionMenu account={{ id: customer.id, name: customer.display_name || customer.name }} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-sm">
                  {(customer.email || customer.primary_email) && (
                    <div className="text-muted-foreground">{customer.email || customer.primary_email}</div>
                  )}
                  {(customer.phone || customer.primary_phone) && (
                    <div className="text-muted-foreground">{customer.phone || customer.primary_phone}</div>
                  )}
                </div>
                
                {/* Remove tags display for now since we're working with unified data */}
                
                <div className="text-xs text-muted-foreground">
                  Updated {formatDistanceToNow(new Date(customer.updated_at), { addSuffix: true })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {customers.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No customers found</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchQuery 
                  ? "No customers match your search criteria. Try adjusting your search terms."
                  : "Get started by adding your first customer to the system."
                }
              </p>
              {!searchQuery && (
                <Button onClick={() => setAddCustomerOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Customer
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AddCustomerModal
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        onSuccess={handleCustomerAdded}
      />
    </AppLayout>
  );
}