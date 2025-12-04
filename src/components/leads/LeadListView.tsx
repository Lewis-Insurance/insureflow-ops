import { useState, useMemo } from 'react';
import { useLeads } from '@/hooks/useLeads';
import { Lead, LeadStatus } from '@/types/leads';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  flexRender,
} from '@tanstack/react-table';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MoreHorizontal,
  Mail,
  Phone,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Download,
  Filter,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { LeadDetailView } from './LeadDetailView';
import { useUpdateLead, useDeleteLead } from '@/hooks/useLeads';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500' },
  contacted: { label: 'Contacted', color: 'bg-purple-500' },
  qualified: { label: 'Qualified', color: 'bg-indigo-500' },
  quoted: { label: 'Quoted', color: 'bg-amber-500' },
  won: { label: 'Won', color: 'bg-green-500' },
  lost: { label: 'Lost', color: 'bg-red-500' },
  nurturing: { label: 'Nurturing', color: 'bg-teal-500' },
};

export function LeadListView() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [pageSize, setPageSize] = useState(25);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<string>('all');

  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  // Build filters object for the query
  const filters = useMemo(() => {
    const f: any = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (sourceFilter !== 'all') f.source = sourceFilter;
    if (scoreFilter === 'high') { f.min_score = 80; }
    if (scoreFilter === 'medium') { f.min_score = 60; f.max_score = 79; }
    if (scoreFilter === 'low') { f.max_score = 59; }
    return f;
  }, [statusFilter, sourceFilter, scoreFilter]);

  const { data: leadsResponse, isLoading } = useLeads(filters);

  // Cast to Lead[] - API ensures these properties exist with defaults
  const leads = (leadsResponse?.data || []) as unknown as Lead[];

  const columns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'lead_score',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Score
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const score = row.getValue('lead_score') as number;
          const getScoreColor = (s: number) => {
            if (s >= 80) return 'bg-green-500 text-white';
            if (s >= 60) return 'bg-blue-500 text-white';
            if (s >= 40) return 'bg-amber-500 text-white';
            return 'bg-red-500 text-white';
          };
          return (
            <Badge className={cn('font-semibold', getScoreColor(score))}>
              {score}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'first_name',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Name
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const lead = row.original;
          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={lead.assigned_producer?.avatar_url} />
                <AvatarFallback className="text-xs">
                  {lead.first_name.charAt(0)}
                  {lead.last_name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {lead.first_name} {lead.last_name}
                </p>
                {lead.email && (
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {lead.email}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'phone',
        header: 'Contact',
        cell: ({ row }) => {
          const lead = row.original;
          return (
            <div className="space-y-1">
              {lead.phone && (
                <div className="flex items-center gap-1 text-sm">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.city && lead.state && (
                <div className="text-xs text-muted-foreground">
                  {lead.city}, {lead.state}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Status
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const status = row.getValue('status') as LeadStatus;
          const config = STATUS_CONFIG[status];
          return (
            <Badge variant="secondary" className="font-medium">
              {config.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'insurance_types',
        header: 'Insurance Types',
        cell: ({ row }) => {
          const types = row.getValue('insurance_types') as string[];
          if (!types || types.length === 0) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {types.slice(0, 2).map((type) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
              {types.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{types.length - 2}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'source_details',
        header: 'Source',
        cell: ({ row }) => {
          const source = row.getValue('source_details') as string | undefined;
          return (
            <span className="text-sm capitalize">
              {source?.replace('_', ' ') || '-'}
            </span>
          );
        },
      },
      {
        accessorKey: 'estimated_premium',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Est. Premium
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const premium = row.getValue('estimated_premium') as number | null;
          if (!premium) return <span className="text-muted-foreground">-</span>;
          return (
            <span className="font-medium">
              ${premium.toLocaleString()}
            </span>
          );
        },
      },
      {
        accessorKey: 'assigned_producer',
        header: 'Assigned To',
        cell: ({ row }) => {
          const producer = row.original.assigned_producer;
          if (!producer) {
            return <span className="text-muted-foreground text-sm">Unassigned</span>;
          }
          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={producer.avatar_url} />
                <AvatarFallback className="text-xs">
                  {producer.full_name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{producer.full_name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
              className="-ml-4"
            >
              Created
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="ml-2 h-4 w-4" />
              ) : (
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const date = row.getValue('created_at') as string;
          return (
            <div className="text-sm">
              <p>{formatDistanceToNow(new Date(date), { addSuffix: true })}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(date), 'MMM d, yyyy')}
              </p>
            </div>
          );
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const lead = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    setDetailPanelOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    toast.info('Edit functionality coming soon');
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Lead
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    toast.info('Assign functionality coming soon');
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Producer
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Phone className="h-4 w-4 mr-2" />
                  Call Lead
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this lead?')) {
                      deleteLead.mutate(lead.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Lead
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [deleteLead]
  );

  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      pagination: {
        pageIndex: 0,
        pageSize,
      },
    },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const hasSelection = selectedRows.length > 0;

  const handleExport = () => {
    const dataToExport = hasSelection
      ? selectedRows.map((row) => row.original)
      : leads;

    // Convert to CSV
    const headers = [
      'Name',
      'Email',
      'Phone',
      'Status',
      'Score',
      'Insurance Types',
      'Source',
      'Est. Premium',
      'Assigned To',
      'Created',
    ];
    
    const csvContent = [
      headers.join(','),
      ...dataToExport.map((lead) =>
        [
          `"${lead.first_name} ${lead.last_name}"`,
          lead.email || '',
          lead.phone || '',
          lead.status,
          lead.lead_score,
          `"${lead.insurance_types?.join(', ') || ''}"`,
          lead.source_details || '',
          lead.estimated_premium || '',
          lead.assigned_producer?.full_name || 'Unassigned',
          format(new Date(lead.created_at), 'yyyy-MM-dd'),
        ].join(',')
      ),
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${dataToExport.length} leads`);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lead List</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
              >
                <Download className="h-4 w-4 mr-2" />
                Export {hasSelection ? `(${selectedRows.length})` : 'All'}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by name, email, phone..."
                value={(table.getColumn('first_name')?.getFilterValue() as string) ?? ''}
                onChange={(event) =>
                  table.getColumn('first_name')?.setFilterValue(event.target.value)
                }
                className="max-w-sm"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="nurturing">Nurturing</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="social_media">Social Media</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="walk_in">Walk-in</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="event">Event</SelectItem>
              </SelectContent>
            </Select>

            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scores</SelectItem>
                <SelectItem value="high">High (80+)</SelectItem>
                <SelectItem value="medium">Medium (60-79)</SelectItem>
                <SelectItem value="low">Low (&lt;60)</SelectItem>
              </SelectContent>
            </Select>

            {(statusFilter !== 'all' || sourceFilter !== 'all' || scoreFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all');
                  setSourceFilter('all');
                  setScoreFilter('all');
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>

          {/* Bulk Actions */}
          {hasSelection && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg mt-3">
              <span className="text-sm font-medium">
                {selectedRows.length} lead(s) selected
              </span>
              <div className="flex-1" />
              <Button variant="outline" size="sm">
                <UserPlus className="h-4 w-4 mr-2" />
                Bulk Assign
              </Button>
              <Button variant="outline" size="sm">
                <Mail className="h-4 w-4 mr-2" />
                Send Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (confirm(`Delete ${selectedRows.length} leads?`)) {
                    selectedRows.forEach((row) => {
                      deleteLead.mutate(row.original.id);
                    });
                    setRowSelection({});
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      Loading leads...
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={(e) => {
                        // Don't open detail if clicking checkbox or action menu
                        if (
                          (e.target as HTMLElement).closest('[role="checkbox"]') ||
                          (e.target as HTMLElement).closest('button')
                        ) {
                          return;
                        }
                        setSelectedLeadId(row.original.id);
                        setDetailPanelOpen(true);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No leads found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between space-x-2 py-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Showing {table.getState().pagination.pageIndex * pageSize + 1} to{' '}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * pageSize,
                  table.getFilteredRowModel().rows.length
                )}{' '}
                of {table.getFilteredRowModel().rows.length} leads
              </span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lead Detail View */}
      <LeadDetailView
        leadId={selectedLeadId}
        open={detailPanelOpen}
        onOpenChange={setDetailPanelOpen}
      />
    </>
  );
}
