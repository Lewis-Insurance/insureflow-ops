import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Building2, UserPlus, FileText, LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceWithEntities } from '@/types/workspace';

interface EntityBadgeProps {
    workspace: WorkspaceWithEntities;
    showLink?: boolean;
    size?: 'sm' | 'default';
}

export function EntityBadge({ workspace, showLink = true, size = 'default' }: EntityBadgeProps) {
    const { linked_entity_type, account_id, lead_id, policy_id } = workspace;

    if (!linked_entity_type) {
        return (
            <Badge variant="outline" className="text-muted-foreground gap-1">
                <LinkIcon className="h-3 w-3" />
                Unlinked
            </Badge>
        );
    }

    const getEntityConfig = () => {
        switch (linked_entity_type) {
            case 'account':
                return {
                    icon: Building2,
                    label: workspace.account_name || 'Account',
                    href: `/customers/${account_id}`,
                    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border-blue-200 dark:border-blue-800',
                    hoverColor: 'hover:bg-blue-200 dark:hover:bg-blue-800/70',
                };
            case 'lead':
                return {
                    icon: UserPlus,
                    label: workspace.lead_name || 'Lead',
                    href: `/leads/${lead_id}`,
                    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-200 dark:border-amber-800',
                    hoverColor: 'hover:bg-amber-200 dark:hover:bg-amber-800/70',
                };
            case 'policy':
                return {
                    icon: FileText,
                    label: workspace.policy_number || 'Policy',
                    sublabel: workspace.carrier_name,
                    href: `/policies/${policy_id}`,
                    color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200 border-green-200 dark:border-green-800',
                    hoverColor: 'hover:bg-green-200 dark:hover:bg-green-800/70',
                };
            default:
                return null;
        }
    };

    const config = getEntityConfig();
    if (!config) return null;

    const Icon = config.icon;
    const isSmall = size === 'sm';

    const content = (
        <Badge
            variant="outline"
            className={cn(
                'gap-1.5 font-medium transition-colors cursor-pointer',
                config.color,
                showLink && config.hoverColor,
                isSmall ? 'text-xs px-1.5 py-0' : 'px-2.5 py-0.5'
            )}
        >
            <Icon className={cn('flex-shrink-0', isSmall ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')} />
            <span className="truncate max-w-[150px]">{config.label}</span>
            {config.sublabel && !isSmall && (
                <span className="text-xs opacity-75 truncate">({config.sublabel})</span>
            )}
        </Badge>
    );

    if (showLink && config.href) {
        return (
            <Link
                to={config.href}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex"
            >
                {content}
            </Link>
        );
    }

    return content;
}
