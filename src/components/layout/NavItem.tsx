import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { MouseEvent } from 'react';
import { useNavigationGuard } from './AppLayout';

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  to: string;
  badge?: string;
}

export function NavItem({ icon: Icon, label, to, badge }: NavItemProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { onNavigateAttempt } = useNavigationGuard();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigateAttempt) return;

    const shouldContinue = onNavigateAttempt(to);
    if (!shouldContinue) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    navigate(to);
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to={to} onClick={handleClick} className={cn("flex items-center gap-2 w-full")}>
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
