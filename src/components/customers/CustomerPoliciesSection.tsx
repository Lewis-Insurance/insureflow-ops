import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusPill, Chip, AccentSpine } from '@/components/cc';
import { usePolicies, type PolicyWithAccount } from '@/hooks/usePolicies';
import { useQuotesByAccount } from '@/hooks/useQuotes';
import { Shield, Calendar, Building, Plus, Eye, Pencil, FileText, CheckSquare, FolderOpen, Quote, CheckCircle, XCircle, MoreVertical } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { humanizeLine, humanizeCarrier } from '@/lib/format';
import { AddPolicyModal } from './AddPolicyModal';
import { AddQuoteModal } from './AddQuoteModal';
import { AddNoteModal } from './AddNoteModal';
import { AddTaskModal } from './AddTaskModal';
import { UploadDocModal } from './UploadDocModal';
import { EditPolicyModal } from './EditPolicyModal';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CustomerPoliciesSectionProps {
  accountId: string;
}

// A coverage value can be null, an empty object, or a populated object. Never
// render a raw object or a literal "{}" to the user (DATA-REALITY.md).
function hasCoverage(coverage: unknown): boolean {
  if (coverage == null) return false;
  if (typeof coverage === 'object') return Object.keys(coverage as object).length > 0;
  if (typeof coverage === 'string') return coverage.trim().length > 0 && coverage.trim() !== '{}';
  return true;
}

export function CustomerPoliciesSection({ accountId }: CustomerPoliciesSectionProps) {
  const { data: allPolicies = [], isLoading: policiesLoading, refetch: refetchPolicies } = usePolicies();
  const { data: quotes = [], isLoading: quotesLoading, refetch: refetchQuotes } = useQuotesByAccount(accountId);
  const navigate = useNavigate();
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [editPolicyOpen, setEditPolicyOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyWithAccount | null>(null);
  const { toast } = useToast();

  // Filter policies for this specific customer
  const policies = allPolicies.filter(policy => policy.account_id === accountId);

  // Split policies into active and inactive. Active is the explicit live set; inactive is
  // EVERYTHING else (catch-all) so a terminal status the list doesn't enumerate (e.g. a
  // renewal marked 'lost' or 'non_renewed') can never fall through both filters and vanish
  // from the customer record. A null status defaults to active (unchanged prior behavior).
  const ACTIVE_STATUSES = ['active', 'bound', 'pending'];
  const isActivePolicy = (policy: PolicyWithAccount) =>
    ACTIVE_STATUSES.includes(policy.status?.toLowerCase() || 'active');
  const activePolicies = policies.filter(isActivePolicy);
  const inactivePolicies = policies.filter((policy) => !isActivePolicy(policy));

  const isLoading = policiesLoading || quotesLoading;

  const refetch = () => {
    refetchPolicies();
    refetchQuotes();
  };

  const updatePolicyStatus = async (policyId: string, newStatus: 'active' | 'inactive') => {
    try {
      const { error } = await supabase
        .from('policies')
        .update({ status: newStatus === 'active' ? 'active' : 'cancelled' })
        .eq('id', policyId);

      if (error) throw error;

      toast({
        title: 'Policy Updated',
        description: `Policy status changed to ${newStatus === 'active' ? 'Active' : 'Inactive'}.`,
      });
      refetchPolicies();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update policy status.',
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Policies & Quotes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading policies...</div>
        </CardContent>
      </Card>
    );
  }

  // Renders a single policy card. The whole card is the clickable affordance to
  // open the policy. Per-card actions are ghost ("View policy") + a three-dot
  // overflow only. No per-card lime fill: the surface shows many cards and the
  // one lime fill on this tab is the section-level "New policy" button.
  const renderPolicyCard = (policy: PolicyWithAccount, variant: 'active' | 'inactive') => {
    const openPolicy = () => navigate(`/policies/${policy.id}`);
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const isActive = variant === 'active';

    return (
      <AccentSpine
        key={policy.id}
        active={isActive}
        role="button"
        tabIndex={0}
        onClick={openPolicy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPolicy();
          }
        }}
        className="cursor-pointer p-4 hover:bg-cc-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring focus-visible:ring-offset-2"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Policy Basic Info */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h4 className="font-semibold text-cc-text-primary">
                {humanizeLine(policy.line_of_business) || 'General policy'}
              </h4>
              <StatusPill status={policy.status || (isActive ? 'active' : 'cancelled')} />
            </div>
            <div className="space-y-1 text-sm text-cc-text-muted">
              {policy.policy_number && (
                <div className="flex items-center gap-2">
                  <span>Policy #:</span>
                  <span className="font-mono cc-num">{policy.policy_number}</span>
                </div>
              )}
              {policy.carrier_info?.name && (
                <div className="flex items-center gap-2">
                  <Building className="h-3 w-3" />
                  <Chip>{humanizeCarrier(policy.carrier_info.name)}</Chip>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div>
            <div className="space-y-1 text-sm">
              {policy.effective_date && (
                <div>
                  <span className="text-cc-text-muted">Effective:</span>
                  <div className="flex items-center gap-1 text-cc-text-secondary">
                    <Calendar className="h-3 w-3" />
                    <span className="cc-num">{formatLocalDateDisplay(policy.effective_date)}</span>
                  </div>
                </div>
              )}
              {policy.expiration_date && (
                <div>
                  <span className="text-cc-text-muted">Expires:</span>
                  <div className="flex items-center gap-1 text-cc-text-secondary">
                    <Calendar className="h-3 w-3" />
                    <span className="cc-num">{formatLocalDateDisplay(policy.expiration_date)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Premium: the anchor. Carried by weight, rendered once (no standalone $ glyph). */}
          <div>
            <span className="text-cc-text-muted text-xs">Premium</span>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="cc-num font-mono text-xl font-semibold text-cc-text-primary">
                {formatCurrency(policy.premium)}
              </span>
              {policy.premium ? (
                <span className="text-sm text-cc-text-muted">
                  / {policy.billing_frequency || 'annual'}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Actions: one ghost "View policy" + a three-dot overflow. No per-card lime. */}
        <div className="mt-3 pt-3 border-t border-cc-border-subtle flex flex-wrap items-center gap-2" onClick={stop}>
          <Button
            variant="outline"
            size="sm"
            onClick={openPolicy}
            className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Eye className="h-4 w-4" />
            View policy
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="More policy actions"
                className="h-9 w-9 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-cc-lg">
              <DropdownMenuItem
                onClick={() => {
                  setSelectedPolicy(policy);
                  setEditPolicyOpen(true);
                }}
                className="gap-2 text-cc-text-secondary"
              >
                <Pencil className="h-4 w-4" />
                Edit policy
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedPolicyId(policy.id);
                  setAddNoteOpen(true);
                }}
                className="gap-2 text-cc-text-secondary"
              >
                <FileText className="h-4 w-4" />
                Add note
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedPolicyId(policy.id);
                  setAddTaskOpen(true);
                }}
                className="gap-2 text-cc-text-secondary"
              >
                <CheckSquare className="h-4 w-4" />
                Add task
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedPolicyId(policy.id);
                  setUploadDocOpen(true);
                }}
                className="gap-2 text-cc-text-secondary"
              >
                <FolderOpen className="h-4 w-4" />
                Documents
              </DropdownMenuItem>
              {isActive ? (
                <DropdownMenuItem
                  onClick={() => updatePolicyStatus(policy.id, 'inactive')}
                  className="gap-2 text-cc-text-secondary"
                >
                  <XCircle className="h-4 w-4" />
                  Mark inactive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => updatePolicyStatus(policy.id, 'active')}
                  className="gap-2 text-cc-text-secondary"
                >
                  <CheckCircle className="h-4 w-4" />
                  Mark active
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Coverage line: muted summary or nothing. Never a raw object. */}
        {hasCoverage(policy.coverage) && (
          <div className="mt-3 pt-3 border-t border-cc-border-subtle text-sm text-cc-text-muted">
            <span>Coverage on file</span>
          </div>
        )}
      </AccentSpine>
    );
  };

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Policies & Quotes
        </CardTitle>
        <div className="flex gap-2">
          {/* New quote is the ghost secondary. New policy is the single lime primary. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddQuoteOpen(true)}
            className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
          >
            <Plus className="h-4 w-4" />
            New quote
          </Button>
          <Button
            data-primary
            size="sm"
            onClick={() => setAddPolicyOpen(true)}
            className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
          >
            <Plus className="h-4 w-4" />
            New policy
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="policies" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="policies">
              <Shield className="h-4 w-4 mr-2" />
              Policies (<span className="cc-num">{policies.length}</span>)
            </TabsTrigger>
            <TabsTrigger value="quotes">
              <Quote className="h-4 w-4 mr-2" />
              Quotes (<span className="cc-num">{quotes.length}</span>)
            </TabsTrigger>
          </TabsList>

          {/* Policies Tab */}
          <TabsContent value="policies">
            {policies.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="h-12 w-12 text-cc-text-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-cc-text-primary">No policies</h3>
                <p className="text-cc-text-muted mb-4">
                  This customer doesn't have any policies yet. Use New policy above to add the first and start the book.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setAddPolicyOpen(true)}
                  className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <Plus className="h-4 w-4" />
                  Add policy
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active Policies Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-cc-text-primary">
                    <CheckCircle className="h-5 w-5 text-cc-success" />
                    Active policies (<span className="cc-num">{activePolicies.length}</span>)
                  </h3>
                  {activePolicies.length === 0 ? (
                    <div className="text-center py-4 rounded-cc-md border border-cc-border-subtle bg-cc-surface">
                      <p className="text-cc-text-muted">No active policies</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activePolicies.map((policy) => renderPolicyCard(policy, 'active'))}
                    </div>
                  )}
                </div>

                {/* Inactive Policies Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-cc-text-secondary">
                    <XCircle className="h-5 w-5 text-cc-text-muted" />
                    Inactive policies (<span className="cc-num">{inactivePolicies.length}</span>)
                  </h3>
                  {inactivePolicies.length === 0 ? (
                    <div className="text-center py-4 rounded-cc-md border border-cc-border-subtle bg-cc-surface">
                      <p className="text-cc-text-muted">No inactive policies</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {inactivePolicies.map((policy) => renderPolicyCard(policy, 'inactive'))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes">
            {quotes.length === 0 ? (
              <div className="text-center py-8">
                <Quote className="h-12 w-12 text-cc-text-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-cc-text-primary">No quotes</h3>
                <p className="text-cc-text-muted mb-4">
                  This customer doesn't have any quotes yet.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setAddQuoteOpen(true)}
                  className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create first quote
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {quotes.map((quote) => (
                  <div
                    key={quote.id}
                    className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Quote Basic Info */}
                      <div className="md:col-span-2">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{humanizeLine(quote.line_of_business) || 'General Quote'}</h4>
                          <StatusPill status={quote.status || 'open'} />
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {quote.quote_ref && (
                            <div className="flex items-center gap-2">
                              <span>Quote Ref:</span>
                              <span className="font-mono">{quote.quote_ref}</span>
                            </div>
                          )}
                          {quote.carrier_info?.name && (
                            <div className="flex items-center gap-2">
                              <Building className="h-3 w-3" />
                              <Chip>{humanizeCarrier(quote.carrier_info.name)}</Chip>
                            </div>
                          )}
                          {quote.competitor_carrier && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Competitor:</span>
                              <Chip>{humanizeCarrier(quote.competitor_carrier)}</Chip>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dates */}
                      <div>
                        <div className="space-y-1 text-sm">
                          <div>
                            <label className="text-muted-foreground">Created:</label>
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(quote.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          {quote.expires_at && (
                            <div>
                              <label className="text-muted-foreground">Expires:</label>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{formatLocalDateDisplay(quote.expires_at)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Premium */}
                      <div>
                        <div className="text-sm">
                          <label className="text-cc-text-muted">Premium:</label>
                          <div className="font-semibold text-cc-text-primary">
                            <span className="cc-num font-mono">{formatCurrency(quote.premium)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-cc-border-subtle pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                      >
                        <Link to={`/quotes/${quote.id}`}>
                          <Eye className="h-4 w-4 mr-1" />
                          View quote
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                        onClick={() => {
                          // Convert quote to policy
                          toast({
                            title: 'Convert to policy',
                            description: 'This feature is coming soon.',
                          });
                        }}
                      >
                        <Shield className="h-4 w-4 mr-1" />
                        Bind policy
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <AddPolicyModal
        open={addPolicyOpen}
        onOpenChange={setAddPolicyOpen}
        accountId={accountId}
        onSuccess={refetch}
      />
      <AddQuoteModal
        open={addQuoteOpen}
        onOpenChange={setAddQuoteOpen}
        accountId={accountId}
        onSuccess={refetch}
      />
      <AddNoteModal
        open={addNoteOpen}
        onOpenChange={setAddNoteOpen}
        accountId={accountId}
      />
      <AddTaskModal
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        accountId={accountId}
      />
      <UploadDocModal
        open={uploadDocOpen}
        onOpenChange={setUploadDocOpen}
        accountId={accountId}
        onSuccess={() => {
          toast({
            title: "Document Uploaded",
            description: "Document has been successfully uploaded for this policy.",
          });
        }}
      />
      <EditPolicyModal
        open={editPolicyOpen}
        onOpenChange={setEditPolicyOpen}
        policy={selectedPolicy}
        onSuccess={() => {
          refetch();
          toast({
            title: "Policy Updated",
            description: "Policy has been successfully updated.",
          });
        }}
      />
    </Card>
  );
}
