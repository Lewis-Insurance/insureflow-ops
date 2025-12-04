import { useState } from 'react';
import { useLeads, type LeadFilters } from '@/hooks/useLeads';
import { useLeadSources } from '@/integrations/supabase/hooks/useLeadSources';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Filter, Plus, Phone, Mail, MapPin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LeadsListProps {
  onLeadSelect?: (leadId: string) => void;
  onCreateLead?: () => void;
}

export function LeadsList({ onLeadSelect, onCreateLead }: LeadsListProps) {
  const [filters, setFilters] = useState<LeadFilters>({});
  const [searchQuery, setSearchQuery] = useState('');

  const { data: leadsResponse, isLoading } = useLeads(filters);
  const leads = leadsResponse?.data || [];
  const { data: sources = [] } = useLeadSources();

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    const timeoutId = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value || undefined }));
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  const handleFilterChange = (key: keyof LeadFilters, value: string | string[]) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const getLeadScoreBadge = (score: number | null) => {
    if (!score) return null;
    
    if (score >= 80) {
      return <Badge className="bg-green-500">Hot ({score})</Badge>;
    } else if (score >= 60) {
      return <Badge className="bg-yellow-500">Warm ({score})</Badge>;
    } else {
      return <Badge variant="secondary">Cold ({score})</Badge>;
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading leads...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Leads</CardTitle>
          {onCreateLead && (
            <Button onClick={onCreateLead}>
              <Plus className="mr-2 h-4 w-4" />
              New Lead
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              value={
                filters.status && filters.status.length === 1 
                  ? filters.status[0] 
                  : 'all'
              }
              onValueChange={(value) => 
                handleFilterChange('status', value === 'all' ? [] : [value])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="nurturing">Nurturing</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.source_id || 'all'}
              onValueChange={(value) => 
                handleFilterChange('source_id', value === 'all' ? '' : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={
                filters.min_score === 80 ? 'hot' :
                filters.min_score === 60 ? 'warm' :
                filters.max_score === 59 ? 'cold' : 'all'
              }
              onValueChange={(value) => {
                if (value === 'hot') {
                  setFilters((prev) => ({ 
                    ...prev, 
                    min_score: 80, 
                    max_score: undefined 
                  }));
                } else if (value === 'warm') {
                  setFilters((prev) => ({ 
                    ...prev, 
                    min_score: 60, 
                    max_score: 79 
                  }));
                } else if (value === 'cold') {
                  setFilters((prev) => ({ 
                    ...prev, 
                    min_score: 0, 
                    max_score: 59 
                  }));
                } else {
                  setFilters((prev) => ({ 
                    ...prev, 
                    min_score: undefined, 
                    max_score: undefined 
                  }));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Lead Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scores</SelectItem>
                <SelectItem value="hot">Hot (80+)</SelectItem>
                <SelectItem value="warm">Warm (60-79)</SelectItem>
                <SelectItem value="cold">Cold (0-59)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No leads found. Create your first lead to get started.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow 
                    key={lead.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onLeadSelect?.(lead.id)}
                  >
                    <TableCell className="font-medium">
                      {lead.first_name} {lead.last_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {lead.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </div>
                        )}
                        {lead.city && lead.state && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {lead.city}, {lead.state}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{lead.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {getLeadScoreBadge(lead.lead_score)}
                    </TableCell>
                    <TableCell>
                      {lead.source?.name || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      {(lead).assigned?.full_name || 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLeadSelect?.(lead.id);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {leads.length} lead{leads.length !== 1 ? 's' : ''}
        </div>
      </CardContent>
    </Card>
  );
}
