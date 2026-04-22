import { Link, useLocation } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { useNavigationGuardContext } from '@/contexts/NavigationGuardContext';

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  to: string;
  badge?: string;
}

export function NavItem({ icon: Icon, label, to, badge }: NavItemProps) {
  const location = useLocation();
  const guardCtx = useNavigationGuardContext();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  const handleClick = (e: React.MouseEvent) => {
    console.log('[NavGuard] NavItem click', { to, guardCtxExists: !!guardCtx, isAnyDirty: guardCtx?.isAnyDirty() });
    if (guardCtx?.isAnyDirty()) {
      e.preventDefault();
      guardCtx.requestNavigation(to);
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to={to} className={cn("flex items-center gap-2 w-full")} onClick={handleClick}>
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <Badge variant="secondary" className="shrink-0 text-xs h-5 min-w-5 flex items-center justify-center">
              {badge}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}