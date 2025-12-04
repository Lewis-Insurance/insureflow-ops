import { useState } from 'react';
import { useLeads, type LeadFilters } from '@/hooks/useLeads';
import { useLeadSources } from '@/integrations/supabase/hooks/useLeadSources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Loader2, Search, Filter, Download, Plus, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { LeadDetailView } from './LeadDetailView';
import { LeadCaptureForm } from './LeadCaptureForm';

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'contacted', label: 'Contacted', color: 'bg-purple-500' },
  { value: 'qualified', label: 'Qualified', color: 'bg-yellow-500' },
  { value: 'quoted', label: 'Quoted', color: 'bg-orange-500' },
  { value: 'won', label: 'Won', color: 'bg-green-500' },
  { value: 'lost', label: 'Lost', color: 'bg-red-500' },
  { value: 'nurturing', label: 'Nurturing', color: 'bg-gray-500' },
];

export function LeadList() {
  const [filters, setFilters] = useState<LeadFilters>({});
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: leadsResponse, isLoading, error } = useLeads({ ...filters, page, pageSize });
  const { data: sources } = useLeadSources();

  const leads = leadsResponse?.data || [];
  const paginationInfo = {
    total: leadsResponse?.total || 0,
    totalPages: leadsResponse?.totalPages || 1,
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setFilters((prev) => ({ ...prev, search: value || undefined }));
    setPage(1); // Reset to first page on search
  };

  const handleStatusFilter = (statuses: string[]) => {
    setFilters((prev) => ({ ...prev, status: statuses.length > 0 ? statuses : undefined }));
    setPage(1); // Reset to first page on filter change
  };

  const handleSourceFilter = (sourceId: string) => {
    setFilters((prev) => ({
      ...prev,
      source_id: sourceId === 'all' ? undefined : sourceId,
    }));
    setPage(1); // Reset to first page on filter change
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1); // Reset to first page when changing page size
  };

  const exportToCSV = () => {
    if (!leads || leads.length === 0) {
      return;
    }

    const headers = ['Name', 'Email', 'Phone', 'Status', 'Score', 'Source', 'Created'];
    const rows = leads.map((lead) => [
      `${lead.first_name} ${lead.last_name}`,
      lead.email || '',
      lead.phone || '',
      lead.status,
      lead.lead_score,
      lead.source_name || '',
      format(new Date(lead.created_at), 'yyyy-MM-dd'),
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Status
                {filters.status && filters.status.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {filters.status.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STATUS_OPTIONS.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status.value}
                  checked={filters.status?.includes(status.value)}
                  onCheckedChange={(checked) => {
                    const current = filters.status || [];
                    const updated = checked
                      ? [...current, status.value]
                      : current.filter((s) => s !== status.value);
                    handleStatusFilter(updated);
                  }}
                >
                  {status.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Select onValueChange={handleSourceFilter} defaultValue="all">
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sources?.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportToCSV}
            disabled={!leads || leads.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={() => setShowNewLeadForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Insurance Types</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={8} columns={9} />}

            {error && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-destructive">
                  Error loading leads: {error instanceof Error ? error.message : 'Unknown error'}
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !error && leads && leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No leads found. Try adjusting your filters or create a new lead.
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !error &&
              leads?.map((lead) => (
                <TableRow 
                  key={lead.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  <TableCell className="font-medium">
                    {lead.first_name} {lead.last_name}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      {lead.email && <div className="truncate max-w-[200px]">{lead.email}</div>}
                      {lead.phone && (
                        <div className="text-muted-foreground">{lead.phone}</div>
                      )}
                      {!lead.email && !lead.phone && (
                        <span className="text-muted-foreground">No contact info</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{lead.lead_score}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.source_name || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {lead.insurance_types && lead.insurance_types.length > 0 ? (
                        <>
                          {lead.insurance_types.slice(0, 2).map((type) => (
                            <Badge key={type} variant="outline" className="text-xs capitalize">
                              {type}
                            </Badge>
                          ))}
                          {lead.insurance_types.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{lead.insurance_types.length - 2}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.assigned_to_name || 'Unassigned'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(lead.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLeadId(lead.id);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!isLoading && !error && paginationInfo.total > 0 && (
          <DataTablePagination
            currentPage={page}
            totalPages={paginationInfo.totalPages}
            pageSize={pageSize}
            totalItems={paginationInfo.total}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        )}
      </div>

      {/* Lead Detail Sheet */}
      {selectedLeadId && leads && (
        <LeadDetailView 
          lead={(leads.find(l => l.id === selectedLeadId)) || null}
          open={!!selectedLeadId}
          onOpenChange={(open) => !open && setSelectedLeadId(null)}
        />
      )}

      {/* New Lead Sheet */}
      <Sheet open={showNewLeadForm} onOpenChange={setShowNewLeadForm}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <div className="py-6">
            <h2 className="text-2xl font-bold mb-6">Create New Lead</h2>
            <LeadCaptureForm onSuccess={() => setShowNewLeadForm(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
