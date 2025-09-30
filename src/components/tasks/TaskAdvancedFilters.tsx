import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, X, CalendarIcon } from 'lucide-react';
import { TaskStatus, TaskPriority, TaskCategory } from '@/hooks/useTasks';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface TaskFilters {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  assignedTo?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  createdDateFrom?: Date;
  createdDateTo?: Date;
}

interface TaskAdvancedFiltersProps {
  onFiltersChange: (filters: TaskFilters) => void;
  onClear: () => void;
}

export function TaskAdvancedFilters({ onFiltersChange, onClear }: TaskAdvancedFiltersProps) {
  const [filters, setFilters] = useState<TaskFilters>({});
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = (key: keyof TaskFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onClear();
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined && v !== '').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Advanced Filters
            {activeFilterCount > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({activeFilterCount} active)
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {activeFilterCount > 0 && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Search */}
          <div>
            <Label>Search</Label>
            <Input
              placeholder="Search tasks..."
              value={filters.search || ''}
              onChange={(e) => updateFilter('search', e.target.value)}
            />
          </div>

          {/* Status, Priority, Category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => updateFilter('status', value === 'all' ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Priority</Label>
              <Select
                value={filters.priority || 'all'}
                onValueChange={(value) => updateFilter('priority', value === 'all' ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Category</Label>
              <Select
                value={filters.category || 'all'}
                onValueChange={(value) => updateFilter('category', value === 'all' ? undefined : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="policy">Policy</SelectItem>
                  <SelectItem value="claim">Claim</SelectItem>
                  <SelectItem value="renewal">Renewal</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Due Date From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !filters.dueDateFrom && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dueDateFrom ? format(filters.dueDateFrom, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dueDateFrom}
                    onSelect={(date) => updateFilter('dueDateFrom', date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Due Date To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !filters.dueDateTo && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dueDateTo ? format(filters.dueDateTo, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dueDateTo}
                    onSelect={(date) => updateFilter('dueDateTo', date)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}