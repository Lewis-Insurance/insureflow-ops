import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/services/supabase';

interface Policy {
  id: string;
  policy_number: string;
  policy_type: 'auto' | 'home' | 'commercial' | 'life' | 'health' | 'umbrella';
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  premium: number | null;
  effective_date: string | null;
  expiration_date: string | null;
  carrier_name: string | null;
  accounts: {
    name: string;
  } | null;
}

type StatusFilter = 'active' | 'expiring' | 'all';

export default function PoliciesScreen() {
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');

  const { data: policies, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['policies', filter, search],
    queryFn: async () => {
      let query = supabase
        .from('policies')
        .select(`
          id,
          policy_number,
          policy_type,
          status,
          premium,
          effective_date,
          expiration_date,
          carrier_name,
          accounts (name)
        `)
        .order('expiration_date', { ascending: true });

      if (filter === 'active') {
        query = query.eq('status', 'active');
      } else if (filter === 'expiring') {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        query = query
          .eq('status', 'active')
          .gte('expiration_date', new Date().toISOString().split('T')[0])
          .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0]);
      }

      if (search) {
        query = query.or(`policy_number.ilike.%${search}%,accounts.name.ilike.%${search}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as Policy[];
    },
  });

  const getPolicyIcon = (type: Policy['policy_type']) => {
    switch (type) {
      case 'auto': return 'car';
      case 'home': return 'home';
      case 'commercial': return 'business';
      case 'life': return 'heart';
      case 'health': return 'medkit';
      case 'umbrella': return 'umbrella';
      default: return 'document';
    }
  };

  const getPolicyColor = (type: Policy['policy_type']) => {
    switch (type) {
      case 'auto': return '#3b82f6';
      case 'home': return '#22c55e';
      case 'commercial': return '#8b5cf6';
      case 'life': return '#ec4899';
      case 'health': return '#14b8a6';
      case 'umbrella': return '#f97316';
      default: return '#64748b';
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysUntilExpiration = (date: string | null) => {
    if (!date) return null;
    const expDate = new Date(date);
    const today = new Date();
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const renderPolicy = ({ item }: { item: Policy }) => {
    const daysUntil = getDaysUntilExpiration(item.expiration_date);
    const isExpiringSoon = daysUntil !== null && daysUntil <= 30 && daysUntil >= 0;

    return (
      <TouchableOpacity style={styles.policyCard} activeOpacity={0.7}>
        <View style={styles.policyHeader}>
          <View style={[styles.policyIcon, { backgroundColor: getPolicyColor(item.policy_type) + '20' }]}>
            <Ionicons
              name={getPolicyIcon(item.policy_type) as any}
              size={24}
              color={getPolicyColor(item.policy_type)}
            />
          </View>
          <View style={styles.policyInfo}>
            <Text style={styles.policyType}>
              {item.policy_type.charAt(0).toUpperCase() + item.policy_type.slice(1)} Policy
            </Text>
            <Text style={styles.policyNumber}>{item.policy_number}</Text>
          </View>
          {isExpiringSoon && (
            <View style={styles.expiringBadge}>
              <Text style={styles.expiringText}>{daysUntil}d</Text>
            </View>
          )}
        </View>

        <View style={styles.policyDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Client</Text>
            <Text style={styles.detailValue}>{item.accounts?.name || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Carrier</Text>
            <Text style={styles.detailValue}>{item.carrier_name || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Premium</Text>
            <Text style={styles.detailValue}>
              {item.premium ? `$${item.premium.toLocaleString()}` : 'N/A'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires</Text>
            <Text style={[styles.detailValue, isExpiringSoon && styles.expiringValue]}>
              {formatDate(item.expiration_date)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search policies..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={20} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {[
          { key: 'active', label: 'Active' },
          { key: 'expiring', label: 'Expiring Soon' },
          { key: 'all', label: 'All' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key as StatusFilter)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === f.key && styles.filterTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Policy List */}
      <FlatList
        data={policies}
        keyExtractor={(item) => item.id}
        renderItem={renderPolicy}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="document-text-outline" size={48} color="#94a3b8" />
            </View>
            <Text style={styles.emptyTitle}>No policies found</Text>
            <Text style={styles.emptyText}>
              {search ? 'Try a different search term' : 'Policies will appear here'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#1e293b',
  },
  filterTabs: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 8,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterTabActive: {
    backgroundColor: '#1e3a8a',
  },
  filterTabText: {
    color: '#64748b',
    fontWeight: '500',
    fontSize: 13,
  },
  filterTabTextActive: {
    color: '#fff',
  },
  list: {
    padding: 16,
  },
  policyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  policyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  policyInfo: {
    flex: 1,
  },
  policyType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  policyNumber: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  expiringBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  expiringText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  policyDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1e293b',
  },
  expiringValue: {
    color: '#dc2626',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});
