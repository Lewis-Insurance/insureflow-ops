import { useState, useEffect } from 'react';
import { Search, X, Calendar, Users, FileText, User, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface DocumentFilters {
  searchText: string;
  uploadedBy?: string[];
  accountId?: string[];
  policyId?: string[];
  category?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

interface AdvancedFiltersProps {
  filters: DocumentFilters;
  onFiltersChange: (filters: DocumentFilters) => void;
  onSaveView?: (name: string) => void;
}

export function AdvancedFilters({ filters, onFiltersChange, onSaveView }: AdvancedFiltersProps) {
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [policies, setPolicies] = useState<Array<{ id: string; policy_number: string }>>([]);
  const [showSaveView, setShowSaveView] = useState(false);
  const [viewName, setViewName] = useState('');

  // Fetch filter options
  useEffect(() => {
    const fetchFilterData = async () => {
      // Fetch agents (profiles with is_staff=true)
      const { data: agentData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_staff', true)
        .order('full_name');
      
      if (agentData) {
        setAgents(agentData.map(a => ({ id: a.id, name: a.full_name || 'Unknown' })));
      }

      // Fetch customers (accounts)
      const { data: customerData } = await supabase
        .from('accounts')
        .select('id, name')
        .order('name')
        .limit(100);
      
      if (customerData) {
        setCustomers(customerData.map(c => ({ id: c.id, name: c.name })));
      }

      // Fetch policies
      const { data: policyData } = await supabase
        .from('policies')
        .select('id, policy_number')
        .order('policy_number')
        .limit(100);
      
      if (policyData) {
        setPolicies(policyData.map(p => ({ id: p.id, policy_number: p.policy_number })));
      }
    };

    fetchFilterData();
  }, []);

  const updateFilter = (key: keyof DocumentFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (key: 'uploadedBy' | 'accountId' | 'policyId' | 'category', value: string) => {
    const current = filters[key] || [];
    const newValue = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    updateFilter(key, newValue.length > 0 ? newValue : undefined);
  };

  const clearAllFilters = () => {
    onFiltersChange({ searchText: '' });
  };

  const activeFilterCount = 
    (filters.uploadedBy?.length || 0) +
    (filters.accountId?.length || 0) +
    (filters.policyId?.length || 0) +
    (filters.category?.length || 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  const handleSaveView = () => {
    if (viewName.trim() && onSaveView) {
      onSaveView(viewName);
      setViewName('');
      setShowSaveView(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Advanced Filters</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary">{activeFilterCount} active</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              <X className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Search Text */}
      <div>
        <Label htmlFor="search-text">Search Documents</Label>
        <Input
          id="search-text"
          placeholder="Search by name, content, or metadata..."
          value={filters.searchText}
          onChange={(e) => updateFilter('searchText', e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Agent Filter */}
        <div>
          <Label>Uploaded By (Agent)</Label>
          <Select onValueChange={(value) => toggleArrayFilter('uploadedBy', value)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={
                filters.uploadedBy?.length 
                  ? `${filters.uploadedBy.length} selected` 
                  : "Select agents..."
              } />
            </SelectTrigger>
            <SelectContent>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>
                  <div className="flex items-center gap-2">
                    {filters.uploadedBy?.includes(agent.id) && <span>✓</span>}
                    <User className="w-3 h-3" />
                    {agent.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.uploadedBy && filters.uploadedBy.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.uploadedBy.map(id => {
                const agent = agents.find(a => a.id === id);
                return agent ? (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {agent.name}
                    <X
                      className="w-3 h-3 ml-1 cursor-pointer"
                      onClick={() => toggleArrayFilter('uploadedBy', id)}
                    />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Customer Filter */}
        <div>
          <Label>Customer</Label>
          <Select onValueChange={(value) => toggleArrayFilter('accountId', value)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={
                filters.accountId?.length 
                  ? `${filters.accountId.length} selected` 
                  : "Select customers..."
              } />
            </SelectTrigger>
            <SelectContent>
              {customers.map(customer => (
                <SelectItem key={customer.id} value={customer.id}>
                  <div className="flex items-center gap-2">
                    {filters.accountId?.includes(customer.id) && <span>✓</span>}
                    <Users className="w-3 h-3" />
                    {customer.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.accountId && filters.accountId.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.accountId.map(id => {
                const customer = customers.find(c => c.id === id);
                return customer ? (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {customer.name}
                    <X
                      className="w-3 h-3 ml-1 cursor-pointer"
                      onClick={() => toggleArrayFilter('accountId', id)}
                    />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Policy Filter */}
        <div>
          <Label>Policy</Label>
          <Select onValueChange={(value) => toggleArrayFilter('policyId', value)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={
                filters.policyId?.length 
                  ? `${filters.policyId.length} selected` 
                  : "Select policies..."
              } />
            </SelectTrigger>
            <SelectContent>
              {policies.map(policy => (
                <SelectItem key={policy.id} value={policy.id}>
                  <div className="flex items-center gap-2">
                    {filters.policyId?.includes(policy.id) && <span>✓</span>}
                    <FileText className="w-3 h-3" />
                    {policy.policy_number}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.policyId && filters.policyId.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.policyId.map(id => {
                const policy = policies.find(p => p.id === id);
                return policy ? (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {policy.policy_number}
                    <X
                      className="w-3 h-3 ml-1 cursor-pointer"
                      onClick={() => toggleArrayFilter('policyId', id)}
                    />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Category Filter */}
        <div>
          <Label>Category</Label>
          <Select onValueChange={(value) => toggleArrayFilter('category', value)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={
                filters.category?.length 
                  ? `${filters.category.length} selected` 
                  : "Select categories..."
              } />
            </SelectTrigger>
            <SelectContent>
              {['policy', 'claim', 'contract', 'certificate', 'quote', 'other'].map(cat => (
                <SelectItem key={cat} value={cat}>
                  <div className="flex items-center gap-2">
                    {filters.category?.includes(cat) && <span>✓</span>}
                    <Tag className="w-3 h-3" />
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.category && filters.category.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.category.map(cat => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  <X
                    className="w-3 h-3 ml-1 cursor-pointer"
                    onClick={() => toggleArrayFilter('category', cat)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Date From */}
        <div>
          <Label>Date From</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left mt-1">
                <Calendar className="w-4 h-4 mr-2" />
                {filters.dateFrom ? format(filters.dateFrom, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={filters.dateFrom}
                onSelect={(date) => updateFilter('dateFrom', date)}
              />
            </PopoverContent>
          </Popover>
          {filters.dateFrom && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => updateFilter('dateFrom', undefined)}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Date To */}
        <div>
          <Label>Date To</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left mt-1">
                <Calendar className="w-4 h-4 mr-2" />
                {filters.dateTo ? format(filters.dateTo, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={filters.dateTo}
                onSelect={(date) => updateFilter('dateTo', date)}
              />
            </PopoverContent>
          </Popover>
          {filters.dateTo && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => updateFilter('dateTo', undefined)}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Save View */}
      {activeFilterCount > 0 && onSaveView && (
        <div className="pt-2 border-t">
          {!showSaveView ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveView(true)}
            >
              Save this view
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="View name..."
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSaveView()}
              />
              <Button size="sm" onClick={handleSaveView}>
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveView(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
