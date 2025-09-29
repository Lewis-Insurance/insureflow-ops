import React from 'react';
import { Search, Calendar, Building2, MapPin, FileText, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import type { PolicyFilters } from '@/hooks/usePolicies';
import { useCarriers, useMGAs, useLinesOfBusiness, useBusinessTypes } from '@/hooks/useLookupData';

interface PolicySearchProps {
  filters: PolicyFilters;
  onFiltersChange: (filters: PolicyFilters) => void;
  onClearFilters: () => void;
}

const POLICY_STATUSES = [
  'Active',
  'Expired',
  'Cancelled',
  'Pending',
  'Suspended'
];

export function PolicySearch({ filters, onFiltersChange, onClearFilters }: PolicySearchProps) {
  const { data: carriers = [], isLoading: carriersLoading } = useCarriers();
  const { data: mgas = [], isLoading: mgasLoading } = useMGAs();
  const { data: linesOfBusiness = [], isLoading: lobLoading } = useLinesOfBusiness();
  const { data: businessTypes = [], isLoading: businessTypesLoading } = useBusinessTypes();
  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  const updateFilter = (key: keyof PolicyFilters, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined
    });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Policy Search & Filters
          </CardTitle>
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''} active
              </Badge>
              <Button variant="ghost" size="sm" onClick={onClearFilters}>
                Clear All
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search policies by number, carrier, or line of business..."
            value={filters.search || ''}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Quick Filters Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Policy Number
            </label>
            <Input
              placeholder="Policy #"
              value={filters.policyNumber || ''}
              onChange={(e) => updateFilter('policyNumber', e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Carrier/Company
            </label>
            <Select value={filters.carrier || 'all'} onValueChange={(value) => updateFilter('carrier', value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select carrier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Carriers</SelectItem>
                {carriersLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : (
                  carriers.map(carrier => (
                    <SelectItem key={carrier.id} value={carrier.name}>{carrier.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Line of Business
            </label>
            <Select value={filters.lineOfBusiness || 'all'} onValueChange={(value) => updateFilter('lineOfBusiness', value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select LOB" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lines</SelectItem>
                {lobLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : (
                  linesOfBusiness.map(lob => (
                    <SelectItem key={lob.id} value={lob.name}>{lob.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Status
            </label>
            <Select value={filters.status || 'all'} onValueChange={(value) => updateFilter('status', value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {POLICY_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Advanced Filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full">
              <Filter className="h-4 w-4 mr-2" />
              Advanced Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-4" align="start">
            <div className="space-y-4">
              <h4 className="font-medium">Date Ranges</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Effective From
                  </label>
                  <Input
                    type="date"
                    value={filters.effectiveDateFrom || ''}
                    onChange={(e) => updateFilter('effectiveDateFrom', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Effective To
                  </label>
                  <Input
                    type="date"
                    value={filters.effectiveDateTo || ''}
                    onChange={(e) => updateFilter('effectiveDateTo', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Expiration From
                  </label>
                  <Input
                    type="date"
                    value={filters.expirationDateFrom || ''}
                    onChange={(e) => updateFilter('expirationDateFrom', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Expiration To
                  </label>
                  <Input
                    type="date"
                    value={filters.expirationDateTo || ''}
                    onChange={(e) => updateFilter('expirationDateTo', e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    <Building2 className="h-3 w-3 inline mr-1" />
                    Business Type
                  </label>
                  <Select value={filters.businessType || 'all'} onValueChange={(value) => updateFilter('businessType', value === 'all' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {businessTypesLoading ? (
                        <SelectItem value="loading" disabled>Loading...</SelectItem>
                      ) : (
                        businessTypes.map(type => (
                          <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    <MapPin className="h-3 w-3 inline mr-1" />
                    Zip Code
                  </label>
                  <Input
                    placeholder="12345"
                    value={filters.zipCode || ''}
                    onChange={(e) => updateFilter('zipCode', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  <FileText className="h-3 w-3 inline mr-1" />
                  MGA
                </label>
                <Select value={filters.mga || 'all'} onValueChange={(value) => updateFilter('mga', value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select MGA" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All MGAs</SelectItem>
                    {mgasLoading ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      mgas.map(mga => (
                        <SelectItem key={mga.id} value={mga.name}>{mga.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  );
}