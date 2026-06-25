export type AdminProfileRole = 'customer' | 'staff' | 'admin'

export interface AdminProvisioningResult {
  action: 'provisioned' | 'deprovisioned'
  user_id: string
  profile_role: AdminProfileRole
  agency_workspace_id: string | null
  membership_role: string | null
  is_staff: boolean
  profile_active: boolean
}

export function isStaffAdminRole(role: string): role is 'staff' | 'admin' {
  return role === 'staff' || role === 'admin'
}

export function normalizeAgencyWorkspaceId(value: unknown): string | null {
  const normalized = String(value || '').trim()
  return normalized || null
}

export async function getActiveAgencyWorkspaceId(
  supabaseAdmin: any,
  agencyWorkspaceId: string | null,
): Promise<string | null> {
  if (!agencyWorkspaceId) return null

  const { data, error } = await supabaseAdmin
    .from('agency_workspaces')
    .select('id')
    .eq('id', agencyWorkspaceId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.id ?? null
}

export async function getProvisionableAgencyWorkspaceId(
  supabaseAdmin: any,
  agencyWorkspaceId: string | null,
  actorId: string,
): Promise<string | null> {
  const activeAgencyWorkspaceId = await getActiveAgencyWorkspaceId(supabaseAdmin, agencyWorkspaceId)
  if (!activeAgencyWorkspaceId) return null

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('agency_workspace_memberships')
    .select('agency_workspace_id, role, status')
    .eq('user_id', actorId)
    .eq('agency_workspace_id', activeAgencyWorkspaceId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  return membership ? activeAgencyWorkspaceId : null
}

export async function getValidDefaultAgencyWorkspaceId(
  supabaseAdmin: any,
  userId: string,
  defaultAgencyWorkspaceId?: string | null,
): Promise<string | null> {
  let defaultAgencyId = normalizeAgencyWorkspaceId(defaultAgencyWorkspaceId)

  if (!defaultAgencyId) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('default_agency_workspace_id')
      .eq('id', userId)
      .single()

    if (profileError) {
      throw profileError
    }

    defaultAgencyId = normalizeAgencyWorkspaceId(profile?.default_agency_workspace_id)
  }

  if (!defaultAgencyId) return null

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('agency_workspace_memberships')
    .select('agency_workspace_id')
    .eq('user_id', userId)
    .eq('agency_workspace_id', defaultAgencyId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  if (!membership) return null

  return await getActiveAgencyWorkspaceId(supabaseAdmin, defaultAgencyId)
}

export async function requireActiveProvisionedAdmin(
  supabaseAdmin: any,
  userId: string,
): Promise<{ role: 'admin'; email?: string | null }> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('role, email, status, deleted_at, is_staff, default_agency_workspace_id')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    throw error || new Error('Admin profile not found')
  }

  const defaultAgencyId = profile.default_agency_workspace_id
  if (
    profile.role !== 'admin' ||
    (profile.status ?? 'active') !== 'active' ||
    profile.deleted_at ||
    profile.is_staff !== true ||
    !defaultAgencyId
  ) {
    throw new Error('Forbidden - Active provisioned admin access required')
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('agency_workspace_memberships')
    .select('agency_workspace_id, status')
    .eq('user_id', userId)
    .eq('agency_workspace_id', defaultAgencyId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  if (!membership) {
    throw new Error('Forbidden - Active provisioned admin access required')
  }

  const { data: agency, error: agencyError } = await supabaseAdmin
    .from('agency_workspaces')
    .select('id, status')
    .eq('id', defaultAgencyId)
    .eq('status', 'active')
    .maybeSingle()

  if (agencyError) {
    throw agencyError
  }

  if (!agency) {
    throw new Error('Forbidden - Active provisioned admin access required')
  }

  return { role: 'admin', email: profile.email ?? null }
}

export async function syncAdminUserProvisioning(
  supabaseAdmin: any,
  params: {
    userId: string
    role: AdminProfileRole
    actorId?: string | null
    agencyWorkspaceId?: string | null
    active?: boolean
    requireExplicitAgency?: boolean
  },
): Promise<AdminProvisioningResult> {
  const { data, error } = await supabaseAdmin.rpc('admin_sync_user_provisioning', {
    p_user_id: params.userId,
    p_profile_role: params.role,
    p_actor_id: params.actorId ?? null,
    p_agency_workspace_id: params.agencyWorkspaceId ?? null,
    p_profile_active: params.active ?? true,
    p_require_explicit_agency: params.requireExplicitAgency ?? false,
  })

  if (error) {
    throw error
  }

  return data as AdminProvisioningResult
}
