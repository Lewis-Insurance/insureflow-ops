import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Users, Phone, Mail, MapPin, MoreVertical, Edit, Trash2, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { Account } from '@/types/crm';

interface AccountListProps {
  accounts: Account[];
  loading?: boolean;
  onEdit?: (account: Account) => void;
  onDelete?: (accountId: string) => void;
  selectedAccounts?: Account[];
  onAccountSelection?: (account: Account, selected: boolean) => void;
}

export function AccountList({ 
  accounts, 
  loading, 
  onEdit, 
  onDelete,
  selectedAccounts = [],
  onAccountSelection
}: AccountListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const handleDeleteClick = (account: Account) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (accountToDelete && onDelete) {
      onDelete(accountToDelete.id);
    }
    setDeleteDialogOpen(false);
    setAccountToDelete(null);
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded w-full"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="flex flex-col items-center space-y-4">
          <Users className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium">No accounts found</h3>
            <p className="text-muted-foreground">
              No accounts match your search criteria. Try adjusting your filters or create a new account.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => {
          const isSelected = selectedAccounts?.some(selected => selected.id === account.id) || false;
          
          return (
            <Card key={account.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {onAccountSelection && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => 
                          onAccountSelection(account, checked as boolean)
                        }
                      />
                    )}
                    {account.type === 'business' ? (
                      <Building2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Users className="h-5 w-5 text-primary" />
                    )}
                    <div>
                      <CardTitle className="text-lg line-clamp-1">{account.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {account.type}
                        </Badge>
                        {account.source && (
                          <Badge variant="outline" className="text-xs">
                            {account.source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to={`/crm/accounts/${account.id}`}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Link>
                    </DropdownMenuItem>
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(account)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Account
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {onDelete && (
                      <DropdownMenuItem 
                        onClick={() => handleDeleteClick(account)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Account
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.phone && (
                <div className="flex items-center space-x-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{account.phone}</span>
                </div>
              )}
              
              {account.email && (
                <div className="flex items-center space-x-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="line-clamp-1">{account.email}</span>
                </div>
              )}
              
              {(account.city || account.state) && (
                <div className="flex items-center space-x-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {[account.city, account.state].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Created {format(new Date(account.created_at), 'MMM d, yyyy')}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/crm/accounts/${account.id}`}>
                      View
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{accountToDelete?.name}"? This action will move the account to trash. You can restore it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}