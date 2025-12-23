/**
 * AI Module Card Component
 * 
 * Displays an AI module in the Lewis AI Hub grid.
 * Shows icon, name, description, usage stats, and category badge.
 */

import React from 'react';
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
    bg: 'bg-blue-500/10 hover:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-500/20',
  },
  purple: {
    bg: 'bg-purple-500/10 hover:bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/20',
    iconBg: 'bg-purple-500/20',
  },
  green: {
    bg: 'bg-green-500/10 hover:bg-green-500/20',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/20',
    iconBg: 'bg-green-500/20',
  },
  orange: {
    bg: 'bg-orange-500/10 hover:bg-orange-500/20',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/20',
    iconBg: 'bg-orange-500/20',
  },
  teal: {
    bg: 'bg-teal-500/10 hover:bg-teal-500/20',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-500/20',
    iconBg: 'bg-teal-500/20',
  },
  indigo: {
    bg: 'bg-indigo-500/10 hover:bg-indigo-500/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-500/20',
    iconBg: 'bg-indigo-500/20',
  },
  slate: {
    bg: 'bg-slate-500/10 hover:bg-slate-500/20',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-500/20',
    iconBg: 'bg-slate-500/20',
  },
  red: {
    bg: 'bg-red-500/10 hover:bg-red-500/20',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20',
    iconBg: 'bg-red-500/20',
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

export function AIModuleCard({ module, className }: AIModuleCardProps) {
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
}

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

