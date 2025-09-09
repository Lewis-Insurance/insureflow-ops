import { useState } from 'react';
import { Plus, Search, Filter, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/layout/AppLayout';
import { ActionMenu } from '@/components/customers/ActionMenu';
import { useCustomers } from '@/hooks/useCustomers';
import { useTags } from '@/hooks/useTags';
import { formatDistanceToNow } from 'date-fns';

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // For now, we'll use a mock account ID - this should come from auth context
  const mockAccountId = "550e8400-e29b-41d4-a716-446655440000";
  
  const { customers, loading, fetchCustomers } = useCustomers(mockAccountId);
  const { tags, seedDefaultTags } = useTags(mockAccountId);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    fetchCustomers(query);
  };

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
            <Button variant="outline" onClick={seedDefaultTags}>
              <Plus className="mr-2 h-4 w-4" />
              Setup Tags
            </Button>
            <Button>
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
              onChange={(e) => handleSearch(e.target.value)}
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
                {customers.filter(c => c.tags?.some(tag => tag.name.toLowerCase().includes('lead'))).length}
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
                    <CardTitle className="text-lg">{customer.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {customer.type} • {customer.status}
                    </CardDescription>
                  </div>
                  <ActionMenu account={{ id: customer.id, name: customer.name }} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-sm">
                  {customer.email && (
                    <div className="text-muted-foreground">{customer.email}</div>
                  )}
                  {customer.phone && (
                    <div className="text-muted-foreground">{customer.phone}</div>
                  )}
                </div>
                
                {customer.tags && customer.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {customer.tags.map((tag) => (
                      <Badge 
                        key={tag.id} 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: tag.color + '20',
                          color: tag.color,
                          borderColor: tag.color + '40'
                        }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
                
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
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Customer
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}