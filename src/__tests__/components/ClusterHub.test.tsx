import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClusterHub } from '@/components/relationships/ClusterHub';
import type { ClusterNode, ClusterRollup } from '@/hooks/useRelationshipGraph';

// The Milton G Smith cluster as get_account_cluster returns it (roll-up fields
// duplicated on every row).
const ROLLUP = {
  size: 4,
  business_count: 3,
  member_count: 1,
  total_policies: 13,
  active_premium: 56899.21,
} as const;

function node(partial: Partial<ClusterNode>): ClusterNode {
  return {
    account_id: 'x',
    name: 'X',
    goes_by: null,
    account_type: 'business',
    account_status: 'active',
    is_business: true,
    node_role: 'owned_business',
    depth: 1,
    policies_count: 0,
    active_premium: null,
    next_expiration: null,
    owner_account_id: 'milton',
    owner_name: 'Milton G Smith',
    cluster_size: ROLLUP.size,
    cluster_business_count: ROLLUP.business_count,
    cluster_member_count: ROLLUP.member_count,
    cluster_total_policies: ROLLUP.total_policies,
    cluster_active_premium: ROLLUP.active_premium,
    ...partial,
  };
}

const CLUSTER: ClusterNode[] = [
  node({ account_id: 'milton', name: 'Milton G Smith', goes_by: 'Milton', account_type: 'individual', is_business: false, node_role: 'owner', depth: 0 }),
  node({ account_id: 'sorensen', name: 'Sorensen & Smith Llc', policies_count: 10, active_premium: 49181, next_expiration: '2026-07-18' }),
  node({ account_id: 'gsms', name: 'Gsms Developers Inc', policies_count: 2, active_premium: 7718.21, next_expiration: '2027-06-07' }),
  node({ account_id: 'hendrix', name: 'Hendrix Smith & Kir Llc', policies_count: 1, active_premium: null, next_expiration: '2026-12-11' }),
];

const ROLLUP_OBJ: ClusterRollup = {
  owner_account_id: 'milton',
  owner_name: 'Milton G Smith',
  size: ROLLUP.size,
  business_count: ROLLUP.business_count,
  member_count: ROLLUP.member_count,
  total_policies: ROLLUP.total_policies,
  active_premium: ROLLUP.active_premium,
};

function renderHub(accountId: string) {
  return render(
    <MemoryRouter>
      <ClusterHub accountId={accountId} cluster={CLUSTER} rollup={ROLLUP_OBJ} loading={false} />
    </MemoryRouter>
  );
}

describe('ClusterHub', () => {
  it('renders the owner at the center and every company in the cluster', () => {
    const { container } = renderHub('sorensen');
    const text = container.textContent ?? '';
    expect(text).toContain('Milton G Smith');
    expect(text).toContain('Sorensen & Smith Llc');
    expect(text).toContain('Gsms Developers Inc');
    expect(text).toContain('Hendrix Smith & Kir Llc');
    expect(text).toContain('Owner');
  });

  it('shows a cross-sell line driven by the cluster roll-up', () => {
    const { container } = renderHub('sorensen');
    expect(screen.getByText(/Cross-sell book/i)).toBeTruthy();
    // 3 companies, 13 cluster policies in the roll-up line
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('13');
    // cluster premium formatted from active_premium
    expect(container.textContent).toMatch(/\$56,899/);
  });

  it('renders nothing when there is no real cluster (size <= 1)', () => {
    const { container } = render(
      <MemoryRouter>
        <ClusterHub
          accountId="solo"
          cluster={[node({ account_id: 'solo', name: 'Solo', is_business: false, node_role: 'owner' })]}
          rollup={{ ...ROLLUP_OBJ, size: 1, business_count: 0 }}
          loading={false}
        />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });
});
