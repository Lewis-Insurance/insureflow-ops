import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Trash2, UserCheck } from 'lucide-react';
import { useAccountMemberships } from '@/hooks/useAccountMemberships';
import { toast } from '@/hooks/use-toast';

interface MembershipManagerProps {
  accountId: string;
  accountName: string;
}

export function MembershipManager({ accountId, accountName }: MembershipManagerProps) {
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'owner' | 'staff' | 'member'>('member');
  const [loading, setLoading] = useState(false);
  const { addMembership } = useAccountMemberships();

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUserEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      // Note: In a real implementation, you'd look up the user by email first
      // For now, we'll show a message that this feature needs user lookup
      toast({
        title: "Feature pending",
        description: "User lookup by email not yet implemented. Direct user ID required.",
        variant: "destructive",
      });
      
      setNewUserEmail('');
      setNewUserRole('member');
    } catch (error) {
      // Error handling is done via toast in membership hook
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Account Access Management
        </CardTitle>
        <CardDescription>
          Manage who has access to {accountName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Member Form */}
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium">Add New Member</h4>
          <form onSubmit={handleAddMember} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select value={newUserRole} onValueChange={(value: any) => setNewUserRole(value)}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member - View access only</SelectItem>
                    <SelectItem value="staff">Staff - Can edit account data</SelectItem>
                    <SelectItem value="owner">Owner - Full control</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              {loading ? 'Adding...' : 'Add Member'}
            </Button>
          </form>
        </div>

        {/* Current Members List */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Current Members</h4>
          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="h-4 w-4" />
              <span className="font-medium">Note:</span>
            </div>
            <p>
              Member list display will be available once the database types are regenerated. 
              The security model is now in place and RLS policies will enforce proper access control.
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <UserCheck className="h-4 w-4 text-green-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-green-800 mb-1">Security Features Active</p>
              <ul className="text-green-700 space-y-1 text-xs">
                <li>• Row Level Security (RLS) enforced</li>
                <li>• Account membership required for access</li>
                <li>• Role-based permissions active</li>
                <li>• Audit logging enabled</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}