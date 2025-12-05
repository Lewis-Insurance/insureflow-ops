import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Calendar, FileText, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { useEffect } from 'react';
import { PendingFollowupsWidget } from './PendingFollowupsWidget';

export function CustomerSearchWidget() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, email, phone')
        .or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(5);
      
      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Search Customers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {results.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {results.map((customer) => (
              <div
                key={customer.id}
                className="p-3 border rounded hover:bg-accent cursor-pointer transition-colors"
                onClick={() => navigate(`/customers/${customer.id}`)}
              >
                <div className="font-medium">{customer.name}</div>
                <div className="text-sm text-muted-foreground">{customer.email || customer.phone}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PolicySearchWidget() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('policies')
        .select(`
          id, 
          policy_number, 
          line_of_business,
          accounts!inner(id, name),
          carriers(name)
        `)
        .or(`policy_number.ilike.%${search}%,line_of_business.ilike.%${search}%`)
        .limit(5);
      
      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" />
          Search Policies
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Policy number or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {results.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {results.map((policy: any) => (
              <div
                key={policy.id}
                className="p-3 border rounded hover:bg-accent cursor-pointer transition-colors"
                onClick={() => navigate(`/policies/${policy.id}`)}
              >
                <div className="font-medium">{policy.policy_number}</div>
                <div className="text-sm text-muted-foreground">
                  {policy.line_of_business} • {policy.carriers?.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function UpcomingRenewalsWidget() {
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRenewals();
  }, []);

  const fetchRenewals = async () => {
    try {
      const now = new Date();
      const thirtyDaysOut = addDays(now, 30);

      const { data, error } = await supabase
        .from('policies')
        .select(`
          id,
          policy_number,
          expiration_date,
          line_of_business,
          premium,
          accounts!inner(id, name),
          carriers(name)
        `)
        .gte('expiration_date', startOfDay(now).toISOString())
        .lte('expiration_date', endOfDay(thirtyDaysOut).toISOString())
        .order('expiration_date', { ascending: true })
        .limit(5);

      if (error) throw error;
      setRenewals(data || []);
    } catch (error) {
      console.error('Error fetching renewals:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Upcoming Renewals
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/renewals')}>
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-3 border rounded space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : renewals.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">No renewals in next 30 days</div>
        ) : (
          <div className="space-y-3">
            {renewals.map((renewal: any) => {
              const account = renewal.accounts;
              return (
                <div
                  key={renewal.id}
                  className="p-3 border rounded hover:bg-accent cursor-pointer transition-colors"
                  onClick={() => navigate(`/policies/${renewal.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{account?.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {renewal.policy_number} • {renewal.line_of_business}
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {format(new Date(renewal.expiration_date), 'MMM d')}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkspaceWidgets() {
  return (
    <div className="space-y-4">
      {/* Pending Follow-ups - Full Width */}
      <PendingFollowupsWidget />
      
      {/* Search Widgets - Same Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <CustomerSearchWidget />
        <PolicySearchWidget />
      </div>
      
      {/* Upcoming Renewals - Full Width */}
      <UpcomingRenewalsWidget />
    </div>
  );
}
