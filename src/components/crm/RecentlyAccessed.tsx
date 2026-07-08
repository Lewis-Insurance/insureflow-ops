import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPhoneForDisplay } from '@/lib/format';
import { Clock, User, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface RecentlyAccessedItem {
  id: string;
  name: string;
  type: 'account' | 'contact';
  accountType?: string;
  email?: string;
  phone?: string;
  accessedAt: string;
}

const STORAGE_KEY = 'crm_recently_accessed';
const MAX_ITEMS = 8;

export function RecentlyAccessed() {
  const [recentItems, setRecentItems] = useState<RecentlyAccessedItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadRecentItems();
  }, []);

  const loadRecentItems = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored);
        setRecentItems(items);
      }
    } catch (error) {
      console.error('Failed to load recent items:', error);
    }
  };

  const handleItemClick = (item: RecentlyAccessedItem) => {
    console.log('RecentlyAccessed: Clicking item:', item);
    if (item.type === 'account') {
      console.log('RecentlyAccessed: Navigating to:', `/crm/accounts/${item.id}`);
      navigate(`/crm/accounts/${item.id}`);
    }
    // Update access time
    addToRecentlyAccessed(item);
  };

  const addToRecentlyAccessed = (item: Omit<RecentlyAccessedItem, 'accessedAt'>) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let items: RecentlyAccessedItem[] = stored ? JSON.parse(stored) : [];
      
      // Remove existing item if present
      items = items.filter(existing => existing.id !== item.id);
      
      // Add new item at the beginning
      items.unshift({
        ...item,
        accessedAt: new Date().toISOString()
      });
      
      // Keep only the most recent items
      items = items.slice(0, MAX_ITEMS);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      setRecentItems(items);
    } catch (error) {
      console.error('Failed to save recent item:', error);
    }
  };

  const clearRecent = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRecentItems([]);
  };

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (recentItems.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-sm font-medium flex items-center">
            <Clock className="h-4 w-4 mr-2" />
            Recently Accessed
          </CardTitle>
          <CardDescription>
            Your last {recentItems.length} accessed customers
          </CardDescription>
        </div>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={clearRecent}
          className="text-xs"
        >
          Clear
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {recentItems.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors"
              onClick={() => handleItemClick(item)}
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  {item.type === 'account' ? (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    {item.email && (
                      <span className="truncate">{item.email}</span>
                    )}
                    {item.phone && (
                      <span>{formatPhoneForDisplay(item.phone)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                {item.accountType && (
                  <Badge variant="secondary" className="text-xs">
                    {item.accountType}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatTime(item.accessedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Export utility function to add items from other components
export const addToRecentlyAccessed = (item: Omit<RecentlyAccessedItem, 'accessedAt'>) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let items: RecentlyAccessedItem[] = stored ? JSON.parse(stored) : [];
    
    // Remove existing item if present
    items = items.filter(existing => existing.id !== item.id);
    
    // Add new item at the beginning
    items.unshift({
      ...item,
      accessedAt: new Date().toISOString()
    });
    
    // Keep only the most recent items
    items = items.slice(0, MAX_ITEMS);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Failed to save recent item:', error);
  }
};

// Update Recently Accessed Account after save
export const updateRecentlyAccessedAccount = (updated: {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  account_type?: 'business' | 'individual' | null;
  type?: string | null;
  updated_at?: string;
}) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const items = JSON.parse(raw) as RecentlyAccessedItem[];

    const idx = items.findIndex(
      (i) => i.id === updated.id && i.type === 'account'
    );
    if (idx === -1) return;

    const computedAccountType =
      updated.account_type ??
      (updated.type && String(updated.type).toLowerCase() === 'business'
        ? 'business'
        : 'individual');

    items[idx] = {
      ...items[idx],
      name: updated.name ?? items[idx].name,
      accountType: computedAccountType,
      email: updated.email ?? items[idx].email,
      phone: updated.phone ?? items[idx].phone,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage issues
  }
};
