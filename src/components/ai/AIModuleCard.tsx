/**
 * AI Module Card Component
 *
 * Displays an AI module in the Lewis AI Hub grid.
 * Shows icon, name, description, usage stats, and category badge.
 */

import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Scale,
  Search,
  FileCheck,
  FileSearch,
  FileText,
  FileDigit,
  Brain,
  Sparkles,
  ArrowRight,
  LucideIcon,
} from 'lucide-react';
import type { AIModule } from '@/integrations/supabase/hooks/useAIModules';

// Icon mapping from string names to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  Scale,
  Search,
  FileCheck,
  FileSearch,
  FileText,
  FileDigit,
  Brain,
  Sparkles,
};

// Color mapping for module cards
const COLOR_MAP: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
  blue: {
    bg: 'bg-info/10 hover:bg-info/20',
    text: 'text-info',
    border: 'border-info/20',
    iconBg: 'bg-info/20',
  },
  purple: {
    bg: 'bg-info/10 hover:bg-info/20',
    text: 'text-info',
    border: 'border-info/20',
    iconBg: 'bg-info/20',
  },
  green: {
    bg: 'bg-success/10 hover:bg-success/20',
    text: 'text-success',
    border: 'border-success/20',
    iconBg: 'bg-success/20',
  },
  orange: {
    bg: 'bg-warning/10 hover:bg-warning/20',
    text: 'text-warning',
    border: 'border-warning/20',
    iconBg: 'bg-warning/20',
  },
  teal: {
    bg: 'bg-info/10 hover:bg-info/20',
    text: 'text-info',
    border: 'border-info/20',
    iconBg: 'bg-info/20',
  },
  indigo: {
    bg: 'bg-info/10 hover:bg-info/20',
    text: 'text-info',
    border: 'border-info/20',
    iconBg: 'bg-info/20',
  },
  slate: {
    bg: 'bg-cc-surface-raised hover:bg-cc-surface-overlay',
    text: 'text-cc-text-secondary',
    border: 'border-cc-border-subtle',
    iconBg: 'bg-cc-surface-overlay',
  },
  red: {
    bg: 'bg-destructive/10 hover:bg-destructive/20',
    text: 'text-destructive',
    border: 'border-destructive/20',
    iconBg: 'bg-destructive/20',
  },
};

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  analysis: 'Analysis',
  extraction: 'Extraction',
  generation: 'Generation',
  review: 'Review',
};

interface AIModuleCardProps {
  module: AIModule;
  className?: string;
}

export const AIModuleCard = memo(function AIModuleCard({ module, className }: AIModuleCardProps) {
  const navigate = useNavigate();
  
  const IconComponent = ICON_MAP[module.icon] || FileText;
  const colors = COLOR_MAP[module.color] || COLOR_MAP.blue;
  const categoryLabel = CATEGORY_LABELS[module.category] || module.category;

  const handleClick = () => {
    navigate(`/ai/${module.slug}`);
  };

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 border',
        colors.bg,
        colors.border,
        'hover:shadow-lg hover:scale-[1.02]',
        className
      )}
      onClick={handleClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={cn('p-2.5 rounded-lg', colors.iconBg)}>
            <IconComponent className={cn('h-6 w-6', colors.text)} />
          </div>
          <Badge variant="secondary" className="text-xs font-medium">
            {categoryLabel}
          </Badge>
        </div>

        <h3 className="font-semibold text-lg mb-1.5 flex items-center gap-2">
          {module.name}
          <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </h3>
        
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {module.description}
        </p>

        {module.usage_count > 0 && (
          <p className="text-xs text-muted-foreground">
            Used {module.usage_count} time{module.usage_count !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
});

// Skeleton loader for module cards
export function AIModuleCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="w-11 h-11 bg-muted rounded-lg" />
          <div className="w-16 h-5 bg-muted rounded" />
        </div>
        <div className="h-6 bg-muted rounded w-3/4 mb-2" />
        <div className="h-4 bg-muted rounded w-full mb-1" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </CardContent>
    </Card>
  );
}

export default AIModuleCard;

