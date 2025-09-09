import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/layout/AppLayout';
import { useCustomersSearch } from '@/hooks/useCustomersSearch';
import { ActionMenu } from '@/components/customers/ActionMenu';
import { ChevronDown, Search, X } from 'lucide-react';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const { rows, loading, error, hasMore, filters, setFilters, sort, setSort, loadMore, refresh } = useCustomersSearch();

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Customers</h1>
          <Button onClick={() => navigate('/customers/new')}>
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </Button>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Search Customers</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}>
                <Search className="h-4 w-4 mr-2" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search customers by name or organization..."
                  value={filters.q || ''}
                  onChange={(e) => handleFilterChange('q', e.target.value)}
                />
              </div>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_at_desc">Recently Updated</SelectItem>
                  <SelectItem value="updated_at_asc">Oldest First</SelectItem>
                  <SelectItem value="name_asc">Name A-Z</SelectItem>
                  <SelectItem value="name_desc">Name Z-A</SelectItem>
                  <SelectItem value="rank_desc">Most Relevant</SelectItem>
                </SelectContent>
              </Select>
              {Object.keys(filters).length > 0 && (
                <Button variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
                <div>
                  <Label htmlFor="type">Type</Label>
                  <Select value={filters.type || ''} onValueChange={(value) => handleFilterChange('type', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Types</SelectItem>
                      <SelectItem value="household">Household</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="Enter city"
                    value={filters.city || ''}
                    onChange={(e) => handleFilterChange('city', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    placeholder="Enter state"
                    value={filters.state || ''}
                    onChange={(e) => handleFilterChange('state', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="postal">ZIP Code</Label>
                  <Input
                    id="postal"
                    placeholder="Enter ZIP"
                    value={filters.postal || ''}
                    onChange={(e) => handleFilterChange('postal', e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>
              Results {rows.length > 0 && `(${rows.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-red-600 mb-4 p-3 bg-red-50 rounded">
                {error}
              </div>
            )}
            {rows.length === 0 && !loading ? (
              <div className="text-center py-8 text-muted-foreground">
                No customers found. Try adjusting your search criteria.
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Contact Info</TableHead>
                      <TableHead>Policies</TableHead>
                      <TableHead>Last Contact</TableHead>
                      <TableHead className="w-12">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((customer) => (
                      <TableRow key={customer.account_id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{customer.display_name || 'Unnamed Customer'}</div>
                            {customer.org_name && (
                              <div className="text-sm text-muted-foreground">{customer.org_name}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={customer.type === 'business' ? 'default' : 'secondary'}>
                            {customer.type === 'business' ? 'Business' : 'Household'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {customer.city || customer.state ? (
                            <div className="text-sm">
                              {customer.city}{customer.city && customer.state && ', '}{customer.state}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {customer.primary_email && (
                              <div className="text-sm">{customer.primary_email}</div>
                            )}
                            {customer.primary_phone && (
                              <div className="text-sm text-muted-foreground">{customer.primary_phone}</div>
                            )}
                            {!customer.primary_email && !customer.primary_phone && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {customer.policies_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {customer.last_contact_at ? (
                            <span className="text-sm">
                              {new Date(customer.last_contact_at).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ActionMenu account={{ id: customer.account_id, name: customer.display_name || 'Unnamed Customer' }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button 
                      variant="outline" 
                      onClick={loadMore} 
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Load More'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}