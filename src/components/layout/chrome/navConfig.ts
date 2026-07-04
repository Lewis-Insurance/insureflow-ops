import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, RefreshCw, CheckSquare,
  Users, FileText, Calendar, Phone, MessageSquare, TrendingUp, Contact,
  Bot, Brain, Scale, GitCompare, FileSearch, FileQuestion, Sliders, FolderKanban,
  Shield, FileInput, FilePlus2,
  Megaphone, Send, Landmark, UsersRound, Radio,
  Building2, Briefcase, BarChart3, Target, Heart, DollarSign, Sparkles,
  BookMarked, Receipt, GraduationCap, GitMerge, ScrollText, ClipboardList,
  Award, FileStack, Eye, Activity, Workflow, FileType,
} from 'lucide-react';

/**
 * The Calm Command chrome information architecture (direction B, per the chrome
 * handoff README). The six rail groups carry the 26 primary destinations; every
 * route is mapped to its EXISTING path so nothing becomes unreachable. The full
 * destination list (RAIL groups + the long tail) feeds the command palette's
 * "Jump to" so every route in the app stays one keystroke away.
 *
 * Icons are the codebase's lucide set (the README lists Material Symbols names;
 * these are the mapped lucide equivalents).
 */
export interface NavDest {
  label: string;
  to: string;
  icon: LucideIcon;
  /** quiet neutral NEW dot (never a loud chip) */
  isNew?: boolean;
}

export interface NavGroupDef {
  key: string;
  label: string;
  defaultOpen: boolean;
  items: NavDest[];
}

export const RAIL_GROUPS: NavGroupDef[] = [
  {
    key: 'today',
    label: 'Today',
    defaultOpen: true,
    items: [
      { label: 'My Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'AO Renewals', to: '/ao-renewals', icon: RefreshCw },
      { label: 'Tasks', to: '/tasks', icon: CheckSquare },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    defaultOpen: true,
    items: [
      { label: 'Customers', to: '/customers', icon: Users },
      { label: 'Policies', to: '/policies', icon: FileText },
      { label: 'Renewals', to: '/renewals', icon: Calendar },
      { label: 'Calls', to: '/calls', icon: Phone },
      { label: 'SMS', to: '/sms', icon: MessageSquare },
      { label: 'Leads', to: '/leads', icon: TrendingUp },
      // Contacts maps to the CRM accounts/contacts hub (no dedicated /contacts route).
      { label: 'Contacts', to: '/crm', icon: Contact },
      // Payments (formerly the standalone "Accounting" page) + its Day Sheets shortcut.
      { label: 'Payments', to: '/payments', icon: DollarSign },
      { label: 'Day Sheets', to: '/day-sheets', icon: Receipt },
    ],
  },
  {
    key: 'lewi',
    label: 'Lewi AI',
    defaultOpen: false,
    items: [
      { label: 'AI Hub', to: '/ai-hub', icon: Bot },
      { label: 'Renewal Intelligence', to: '/renewals/intelligence', icon: Brain },
      { label: 'Quote Comparison', to: '/comparison', icon: Scale },
      { label: 'Comparison Analysis', to: '/insurance-comparison', icon: GitCompare },
      { label: 'Explore a Policy', to: '/analyze-documents', icon: FileSearch },
      { label: 'Document Intelligence', to: '/document-intelligence', icon: FileQuestion },
      { label: 'Module Builder', to: '/module-builder', icon: Sliders, isNew: true },
      { label: 'Workspace', to: '/workspace', icon: FolderKanban },
    ],
  },
  {
    key: 'intake',
    label: 'Intake',
    defaultOpen: false,
    items: [
      { label: 'Canopy Import', to: '/canopy-import', icon: Shield, isNew: true },
      { label: 'Import Dec Page', to: '/import-dec-page', icon: FileInput, isNew: true },
      { label: 'ACORD Forms', to: '/acord-forms', icon: FilePlus2 },
    ],
  },
  {
    key: 'business',
    label: 'Business',
    defaultOpen: false,
    items: [
      { label: 'Marketing', to: '/marketing/automations', icon: Megaphone },
      { label: 'Campaigns', to: '/campaigns', icon: Send },
      { label: 'Team', to: '/team-messaging', icon: UsersRound, isNew: true },
      { label: 'Command Center', to: '/command-center', icon: Radio },
    ],
  },
];

/** SYSTEM group: Admin is a footer row; the user menu carries the account. */
export const SYSTEM_ADMIN: NavDest = { label: 'Admin', to: '/admin', icon: Shield };

/**
 * The long tail: every other named destination, so the command palette "Jump to"
 * keeps the whole app reachable even though the rail shows the 26 primary ones.
 */
export const EXTRA_DESTINATIONS: NavDest[] = [
  { label: 'Agency Dashboard', to: '/dashboard/agency', icon: BarChart3 },
  { label: 'Executive', to: '/executive', icon: Target },
  { label: 'Analytics', to: '/analytics', icon: TrendingUp },
  { label: 'Retention', to: '/retention', icon: Shield },
  { label: 'Financial', to: '/financial', icon: DollarSign },
  { label: 'AI Brain', to: '/ai-brain', icon: Brain },
  { label: 'Prism AI', to: '/prism-ai', icon: Sparkles },
  { label: 'Knowledge Manager', to: '/knowledge-manager', icon: BookMarked },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
  { label: 'Customer Success', to: '/customer-success', icon: Heart },
  { label: 'Issues', to: '/issues', icon: Activity },
  { label: 'Predictive Analytics', to: '/predictive-analytics', icon: TrendingUp },
  { label: 'Merge Customers', to: '/merge-customers', icon: GitMerge },
  { label: 'Duplicate review', to: '/duplicates', icon: GitMerge },
  { label: 'Additional Insureds', to: '/additional-insureds', icon: Building2 },
  { label: 'Customization', to: '/customization', icon: Sliders },
  { label: 'Carriers', to: '/carriers', icon: Building2 },
  { label: 'MGAs', to: '/mgas', icon: Briefcase },
  { label: 'ACORD Templates', to: '/acord-templates', icon: ScrollText },
  { label: 'Intake Templates', to: '/intake-templates', icon: ClipboardList },
  { label: 'Certificates', to: '/certificates', icon: Award },
  { label: 'Carrier Templates', to: '/carrier-templates', icon: FileStack },
  { label: 'Extraction Review', to: '/extraction-review', icon: Eye },
  { label: 'Extraction Analytics', to: '/extraction-analytics', icon: Activity },
  { label: 'Marketing Templates', to: '/marketing/templates', icon: FileType },
  { label: 'Marketing Automations', to: '/marketing/automations', icon: Workflow },
  { label: 'Day Sheets', to: '/day-sheets', icon: Receipt },
  { label: 'Bank Reconciliation', to: '/reconciliation', icon: Landmark },
  { label: 'Training', to: '/training', icon: GraduationCap },
  { label: 'Team Messages', to: '/team-messaging', icon: MessageSquare },
  { label: 'Profile Settings', to: '/profile', icon: Sliders },
];

/** Flat list of every rail destination (for active-route matching + palette). */
export const RAIL_DESTINATIONS: NavDest[] = RAIL_GROUPS.flatMap((g) => g.items).concat(SYSTEM_ADMIN);

/** Everything reachable via "Jump to", de-duplicated by path. */
export const ALL_DESTINATIONS: NavDest[] = (() => {
  const seen = new Set<string>();
  const out: NavDest[] = [];
  for (const d of [...RAIL_DESTINATIONS, ...EXTRA_DESTINATIONS]) {
    if (seen.has(d.to + d.label)) continue;
    seen.add(d.to + d.label);
    out.push(d);
  }
  return out;
})();

/**
 * Resolve the best matching destination for a pathname (longest matching `to`),
 * so the rail spine, breadcrumb, and header title follow the current route.
 */
export function destForPath(pathname: string): { group?: NavGroupDef; dest?: NavDest } {
  let best: { group?: NavGroupDef; dest?: NavDest; len: number } = { len: -1 };
  for (const group of RAIL_GROUPS) {
    for (const dest of group.items) {
      if ((pathname === dest.to || pathname.startsWith(dest.to + '/')) && dest.to.length > best.len) {
        best = { group, dest, len: dest.to.length };
      }
    }
  }
  if ((pathname === SYSTEM_ADMIN.to || pathname.startsWith(SYSTEM_ADMIN.to + '/')) && SYSTEM_ADMIN.to.length > best.len) {
    best = { dest: SYSTEM_ADMIN, len: SYSTEM_ADMIN.to.length };
  }
  return { group: best.group, dest: best.dest };
}
