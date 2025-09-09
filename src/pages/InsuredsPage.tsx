import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ChevronDown, ExternalLink, Edit3, PlusCircle, FileUp, Flag, Mail, MessageSquare } from 'lucide-react';
import { useInsuredsSearch } from '@/hooks/useInsuredsSearch';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function InsuredsPage() {
  const nav = useNavigate();
  const { rows, loading, error, filters, setFilters, sort, setSort, loadMore } = useInsuredsSearch({});
  const [open, setOpen] = useState(true);

  const addNote = async (account_id: string) => {
    const body = window.prompt('Note');
    if (!body) return;
    // TODO: Implement after RPC functions are created
    alert('Note functionality will be available once database migration is complete');
  };

  const addTask = async (account_id: string) => {
    const title = window.prompt('Task title');
    if (!title) return;
    // TODO: Implement after RPC functions are created
    alert('Task functionality will be available once database migration is complete');
  };

  const flagDup = async (account_id: string) => {
    const reason = window.prompt('Reason to flag');
    if (!reason) return;
    // TODO: Implement after RPC functions are created
    alert('Flag functionality will be available once database migration is complete');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Customers</h1>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl">Search Customers</CardTitle>
            <Button variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>
          </CardHeader>
          {open && (
            <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <Input placeholder="Search customers..." value={filters.q ?? ''} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} className="md:col-span-3" />
              <Input placeholder="City" value={filters.city ?? ''} onChange={e => setFilters(f => ({ ...f, city: e.target.value }))} />
              <Input placeholder="State" value={filters.state ?? ''} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))} />
              <Input placeholder="ZIP" value={filters.postal ?? ''} onChange={e => setFilters(f => ({ ...f, postal: e.target.value }))} />
              <select className="border rounded px-3 py-2" value={filters.type ?? ''} onChange={e => setFilters(f => ({ ...f, type: e.target.value || undefined }))}>
                <option value="">All Types</option>
                <option value="individual">Individuals</option>
                <option value="business">Businesses</option>
                <option value="household">Households</option>
              </select>
              <select className="border rounded px-3 py-2" value={sort} onChange={e => setSort(e.target.value as any)}>
                <option value="updated_at_desc">Updated ↓</option>
                <option value="updated_at_asc">Updated ↑</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </CardContent>
          )}
        </Card>

        {error && <div className="text-destructive mb-3">{error}</div>}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Results {loading && <span className="text-sm text-muted-foreground">(loading…)</span>}</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 && !loading ? (
              <div className="text-sm text-muted-foreground">No customers match your filters.</div>
            ) : (
              <div className="w-full overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left border-b">
                    <tr>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">City/State</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Phone</th>
                      <th className="py-2 pr-4">#Policies</th>
                      <th className="py-2 pr-4">Last Contact</th>
                      <th className="py-2 pr-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.account_id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{r.display_name || r.org_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.account_id}</div>
                        </td>
                        <td className="py-2 pr-4">
                          {r.type ? <Badge variant="secondary">{r.type}</Badge> : '—'}
                        </td>
                        <td className="py-2 pr-4">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
                        <td className="py-2 pr-4">{r.primary_email || '—'}</td>
                        <td className="py-2 pr-4">{r.primary_phone || '—'}</td>
                        <td className="py-2 pr-4">{r.policies_count ?? 0}</td>
                        <td className="py-2 pr-4">{r.last_contact_at ? new Date(r.last_contact_at).toLocaleDateString() : '—'}</td>
                        <td className="py-2 pr-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline"><ChevronDown className="w-4 h-4 mr-1" /> Actions</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => nav(`/accounts/${r.account_id}`)}>
                                <ExternalLink className="w-4 h-4 mr-2" /> View account
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => nav(`/accounts/${r.account_id}?edit=demographics`)}>
                                <Edit3 className="w-4 h-4 mr-2" /> Edit demographics
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => addNote(r.account_id)}>
                                <MessageSquare className="w-4 h-4 mr-2" /> Add note
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => addTask(r.account_id)}>
                                <PlusCircle className="w-4 h-4 mr-2" /> Add task
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => alert('Open quote flow…')}>
                                <FileUp className="w-4 h-4 mr-2" /> Create quote
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => alert('Upload UI → Supabase Storage')}>
                                <FileUp className="w-4 h-4 mr-2" /> Upload document
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => alert('Start FNOL flow…')}>
                                <Flag className="w-4 h-4 mr-2" /> Start claim
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => alert('Check consent then open SMS/email modal')}>
                                <Mail className="w-4 h-4 mr-2" /> Send email/SMS
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => flagDup(r.account_id)}>
                                <Flag className="w-4 h-4 mr-2" /> Flag duplicate
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > 0 && (
              <div className="mt-3">
                <Button variant="outline" onClick={loadMore} disabled={loading}>Load more</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}