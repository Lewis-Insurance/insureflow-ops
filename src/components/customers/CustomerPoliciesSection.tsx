import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePolicies } from '@/hooks/usePolicies';
import { useQuotesByAccount } from '@/hooks/useQuotes';
import { Shield, Calendar, DollarSign, Building, Plus, Eye, Pencil, FileText, CheckSquare, FolderOpen, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AddPolicyModal } from './AddPolicyModal';
import { AddQuoteModal } from './AddQuoteModal';
import { AddNoteModal } from './AddNoteModal';
import { AddTaskModal } from './AddTaskModal';
import { UploadDocModal } from './UploadDocModal';
import { EditPolicyModal } from './EditPolicyModal';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CustomerPoliciesSectionProps {
  accountId: string;
}

export function CustomerPoliciesSection({ accountId }: CustomerPoliciesSectionProps) {
  const { data: allPolicies = [], isLoading: policiesLoading, refetch: refetchPolicies } = usePolicies();
  const { data: quotes = [], isLoading: quotesLoading, refetch: refetchQuotes } = useQuotesByAccount(accountId);
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [addQuoteOpen, setAddQuoteOpen] = useState(false);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [editPolicyOpen, setEditPolicyOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<any>(null);
  const { toast } = useToast();

  // Filter policies for this specific customer
  const policies = allPolicies.filter(policy => policy.account_id === accountId);

  const isLoading = policiesLoading || quotesLoading;

  const refetch = () => {
    refetchPolicies();
    refetchQuotes();
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'bound':
        return 'default';
      case 'pending':
      case 'quoted':
        return 'secondary';
      case 'expired':
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
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

  const getQuoteStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'won':
      case 'bound':
        return 'default';
      case 'open':
      case 'pending':
        return 'secondary';
      case 'lost':
      case 'declined':
      case 'expired':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Policies & Quotes
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setAddQuoteOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Quote
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setAddPolicyOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Policy
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="policies" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="policies">
              <Shield className="h-4 w-4 mr-2" />
              Policies ({policies.length})
            </TabsTrigger>
            <TabsTrigger value="quotes">
              <Quote className="h-4 w-4 mr-2" />
              Quotes ({quotes.length})
            </TabsTrigger>
          </TabsList>

          {/* Policies Tab */}
          <TabsContent value="policies">
            {policies.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Policies</h3>
                <p className="text-muted-foreground mb-4">
                  This customer doesn't have any policies yet.
                </p>
                <Button onClick={() => setAddPolicyOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Policy
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {policies.map((policy) => (
                  <div
                    key={policy.id}
                    className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Policy Basic Info */}
                      <div className="md:col-span-2">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{policy.line_of_business || 'General Policy'}</h4>
                          <Badge variant={getStatusColor(policy.status || 'active')}>
                            {policy.status || 'Active'}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {policy.policy_number && (
                            <div className="flex items-center gap-2">
                              <span>Policy #:</span>
                              <span className="font-mono">{policy.policy_number}</span>
                            </div>
                          )}
                          {policy.carrier && (
                            <div className="flex items-center gap-2">
                              <Building className="h-3 w-3" />
                              <span>{policy.carrier}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dates */}
                      <div>
                        <div className="space-y-1 text-sm">
                          {policy.effective_date && (
                            <div>
                              <label className="text-muted-foreground">Effective:</label>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{new Date(policy.effective_date).toLocaleDateString()}</span>
                              </div>
                            </div>
                          )}
                          {policy.expiration_date && (
                            <div>
                              <label className="text-muted-foreground">Expires:</label>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{new Date(policy.expiration_date).toLocaleDateString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Premium */}
                      <div>
                        <div className="text-sm">
                          <label className="text-muted-foreground">Premium:</label>
                          <div className="flex items-center gap-1 font-semibold">
                            <DollarSign className="h-3 w-3" />
                            <span>{formatCurrency(policy.premium)}</span>
                          </div>
                          {policy.premium && (
                            <span className="text-muted-foreground text-xs">
                              / {policy.billing_frequency || 'annual'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions - Colorful Buttons */}
                    <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                      <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" asChild>
                        <Link to={`/policies/${policy.id}`}>
                          <Eye className="h-4 w-4 mr-1" />
                          View Policy
                        </Link>
                      </Button>
                      <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                        setSelectedPolicy(policy);
                        setEditPolicyOpen(true);
                      }}>
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit Policy
                      </Button>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                        setSelectedPolicyId(policy.id);
                        setAddNoteOpen(true);
                      }}>
                        <FileText className="h-4 w-4 mr-1" />
                        Add Note
                      </Button>
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => {
                        setSelectedPolicyId(policy.id);
                        setAddTaskOpen(true);
                      }}>
                        <CheckSquare className="h-4 w-4 mr-1" />
                        Add Task
                      </Button>
                      <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => {
                        setSelectedPolicyId(policy.id);
                        setUploadDocOpen(true);
                      }}>
                        <FolderOpen className="h-4 w-4 mr-1" />
                        Documents
                      </Button>
                    </div>

                    {/* Additional Info */}
                    {policy.coverage && (
                      <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                        <span>Coverage: {JSON.stringify(policy.coverage)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes">
            {quotes.length === 0 ? (
              <div className="text-center py-8">
                <Quote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Quotes</h3>
                <p className="text-muted-foreground mb-4">
                  This customer doesn't have any quotes yet.
                </p>
                <Button onClick={() => setAddQuoteOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Quote
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
                          <h4 className="font-semibold">{quote.line_of_business || 'General Quote'}</h4>
                          <Badge variant={getQuoteStatusColor(quote.status || 'open')}>
                            {quote.status || 'Open'}
                          </Badge>
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
                              <span>{quote.carrier_info.name}</span>
                            </div>
                          )}
                          {quote.competitor_carrier && (
                            <div className="flex items-center gap-2 text-orange-600">
                              <span>Competitor: {quote.competitor_carrier}</span>
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
                                <span>{new Date(quote.expires_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Premium */}
                      <div>
                        <div className="text-sm">
                          <label className="text-muted-foreground">Premium:</label>
                          <div className="flex items-center gap-1 font-semibold">
                            <DollarSign className="h-3 w-3" />
                            <span>{formatCurrency(quote.premium)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                      <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" asChild>
                        <Link to={`/quotes/${quote.id}`}>
                          <Eye className="h-4 w-4 mr-1" />
                          View Quote
                        </Link>
                      </Button>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                        // Convert quote to policy
                        toast({
                          title: 'Convert to Policy',
                          description: 'This feature is coming soon.',
                        });
                      }}>
                        <Shield className="h-4 w-4 mr-1" />
                        Bind Policy
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