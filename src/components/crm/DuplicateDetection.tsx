import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Users, Building2, ArrowRight, Merge, X, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { Account, Contact } from '@/types/crm';

interface DuplicateGroup {
  id: string;
  entity_type: 'account' | 'contact';
  entity_ids: string[];
  match_score: number;
  status: 'pending' | 'reviewed' | 'merged' | 'dismissed';
  created_at: string;
}

interface MergeCandidate {
  id: string;
  data: Account | Contact;
  isSelected: boolean;
  isSurvivor: boolean;
}

interface DuplicateDetectionProps {
  onMergeComplete?: () => void;
  className?: string;
}

export function DuplicateDetection({ onMergeComplete, className }: DuplicateDetectionProps) {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [mergeInProgress, setMergeInProgress] = useState(false);

  // Mock data for demonstration
  const mockDuplicateGroups: DuplicateGroup[] = [
    {
      id: '1',
      entity_type: 'account',
      entity_ids: ['acc1', 'acc2'],
      match_score: 0.95,
      status: 'pending',
      created_at: new Date().toISOString()
    },
    {
      id: '2', 
      entity_type: 'contact',
      entity_ids: ['cont1', 'cont2', 'cont3'],
      match_score: 0.87,
      status: 'pending',
      created_at: new Date().toISOString()
    }
  ];

  const scanForDuplicates = async () => {
    setLoading(true);
    try {
      // In development, simulate duplicate scanning
      if (import.meta.env.DEV) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        setDuplicateGroups(mockDuplicateGroups);
      } else {
        // Real duplicate detection using Supabase RPC
        const { data, error } = await supabase.rpc('scan_for_duplicates' as any, { 
          entity_type: 'accounts',
          similarity_threshold: 0.8
        });
        
        if (error) throw error;
        const response = data as { groups?: DuplicateGroup[] } | null;
        setDuplicateGroups(response?.groups || []);
      }
      
      toast({
        title: "Duplicate scan completed",
        description: `Found ${mockDuplicateGroups.length} potential duplicate groups.`,
      });
    } catch (error) {
      toast({
        title: "Error scanning for duplicates",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openMergeDialog = async (group: DuplicateGroup) => {
    setSelectedGroup(group);
    
    // Mock loading candidates
    const mockCandidates: MergeCandidate[] = [
      {
        id: 'acc1',
        data: {
          id: 'acc1',
          type: 'household',
          name: 'John Smith Family',
          email: 'john.smith@email.com',
          phone: '(555) 123-4567',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        } as Account,
        isSelected: true,
        isSurvivor: true
      },
      {
        id: 'acc2', 
        data: {
          id: 'acc2',
          type: 'household',
          name: 'Smith, John',
          email: 'j.smith@email.com',
          phone: '555-123-4567',
          created_at: '2024-02-01T15:30:00Z',
          updated_at: '2024-02-01T15:30:00Z'
        } as Account,
        isSelected: true,
        isSurvivor: false
      }
    ];
    
    setMergeCandidates(mockCandidates);
    setMergeDialogOpen(true);
  };

  const handleMerge = async () => {
    if (!selectedGroup) return;
    
    setMergeInProgress(true);
    try {
      // In development, simulate merge processing
      if (import.meta.env.DEV) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        // Real merge using Supabase RPC
        const { data, error } = await supabase.rpc('merge_duplicate_records' as any, { 
          group_id: selectedGroup.id,
          survivor_id: selectedGroup.entity_ids[0]
        });
        
        if (error) throw error;
        console.log('Records merged:', data);
      }
      
      // Update the group status
      setDuplicateGroups(prev => 
        prev.map(group => 
          group.id === selectedGroup.id 
            ? { ...group, status: 'merged' as const }
            : group
        )
      );
      
      setMergeDialogOpen(false);
      onMergeComplete?.();
      
      toast({
        title: "Records merged successfully",
        description: "The duplicate records have been merged. All related data has been preserved.",
      });
    } catch (error) {
      toast({
        title: "Error merging records",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setMergeInProgress(false);
    }
  };

  const dismissGroup = async (groupId: string) => {
    setDuplicateGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? { ...group, status: 'dismissed' as const }
          : group
      )
    );
    
    toast({
      title: "Duplicate dismissed",
      description: "This group has been marked as not a duplicate.",
    });
  };

  const setSurvivor = (candidateId: string) => {
    setMergeCandidates(prev =>
      prev.map(candidate => ({
        ...candidate,
        isSurvivor: candidate.id === candidateId
      }))
    );
  };

  const pendingGroups = duplicateGroups.filter(g => g.status === 'pending');

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Duplicate Detection
              </CardTitle>
              <CardDescription>
                Find and merge duplicate accounts and contacts to maintain data quality
              </CardDescription>
            </div>
            <Button onClick={scanForDuplicates} disabled={loading}>
              {loading ? 'Scanning...' : 'Scan for Duplicates'}
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Scanning records...</span>
                <span>Processing</span>
              </div>
              <Progress value={65} className="w-full" />
            </div>
          )}

          {pendingGroups.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No duplicates found</p>
              <p className="text-sm">Your data quality looks good!</p>
            </div>
          )}

          {pendingGroups.map((group) => (
            <Card key={group.id} className="border-orange-200">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {group.entity_type === 'account' ? (
                      <Building2 className="h-5 w-5 text-orange-600" />
                    ) : (
                      <Users className="h-5 w-5 text-orange-600" />
                    )}
                    <div>
                      <h4 className="font-medium">
                        {group.entity_ids.length} Potential {group.entity_type === 'account' ? 'Account' : 'Contact'} Duplicates
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Match score: {Math.round(group.match_score * 100)}% • 
                        Found {format(new Date(group.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => dismissGroup(group.id)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openMergeDialog(group)}
                    >
                      <Merge className="h-4 w-4 mr-2" />
                      Review & Merge
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Merge Duplicate Records</DialogTitle>
            <DialogDescription>
              Review the records below and select which one should be the surviving record. 
              All data from other records will be preserved and merged.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {mergeCandidates.map((candidate, index) => (
              <Card 
                key={candidate.id} 
                className={`cursor-pointer transition-colors ${
                  candidate.isSurvivor ? 'border-green-500 bg-green-50' : 'border-gray-200'
                }`}
                onClick={() => setSurvivor(candidate.id)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {candidate.isSurvivor ? (
                          <Check className="h-5 w-5 text-green-600" />
                        ) : (
                          <div className="h-5 w-5 border-2 border-gray-300 rounded" />
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <h4 className="font-medium">
                            {'name' in candidate.data ? candidate.data.name : `${candidate.data.first_name} ${candidate.data.last_name}`}
                          </h4>
                          {candidate.isSurvivor && (
                            <Badge variant="default" className="bg-green-600">
                              Surviving Record
                            </Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Email:</span>
                            <span className="ml-2">{candidate.data.email || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Phone:</span>
                            <span className="ml-2">{candidate.data.phone || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Created:</span>
                            <span className="ml-2">
                              {format(new Date(candidate.data.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Type:</span>
                            <span className="ml-2 capitalize">
                              {'type' in candidate.data ? candidate.data.type : 'contact'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {mergeCandidates.length > 1 && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <ArrowRight className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <h4 className="font-medium text-blue-800">Merge Process</h4>
                      <ul className="text-sm text-blue-700 mt-2 space-y-1">
                        <li>• All timeline events will be preserved</li>
                        <li>• Documents and attachments will be transferred</li>
                        <li>• Contact relationships will be maintained</li>
                        <li>• Merged records will be marked in audit logs</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMerge} disabled={mergeInProgress}>
              {mergeInProgress ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Merging...
                </>
              ) : (
                <>
                  <Merge className="h-4 w-4 mr-2" />
                  Merge Records
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}