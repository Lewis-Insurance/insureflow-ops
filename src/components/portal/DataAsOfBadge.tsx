// ============================================================================
// DATA AS OF BADGE
// ============================================================================
// E&O protection - shows when data was last updated
// ============================================================================

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, AlertTriangle } from 'lucide-react';
import { POLICY_DATA_DISCLAIMER } from '@/types/portal';

interface DataAsOfBadgeProps {
  date: string;
  source?: string;
  showWarningIfOld?: boolean;
  daysUntilWarning?: number;
}

export function DataAsOfBadge({
  date,
  source,
  showWarningIfOld = true,
  daysUntilWarning = 30
}: DataAsOfBadgeProps) {
  const asOfDate = new Date(date);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24));
  const isOld = daysSince > daysUntilWarning;

  const formattedDate = asOfDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={isOld && showWarningIfOld ? 'destructive' : 'secondary'}
            className="text-xs cursor-help"
          >
            {isOld && showWarningIfOld ? (
              <AlertTriangle className="h-3 w-3 mr-1" />
            ) : (
              <Clock className="h-3 w-3 mr-1" />
            )}
            As of {formattedDate}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium mb-1">
            Data last updated: {formattedDate}
            {source && ` (${source})`}
          </p>
          <p className="text-xs text-muted-foreground">
            {POLICY_DATA_DISCLAIMER}
          </p>
          {isOld && showWarningIfOld && (
            <p className="text-xs text-yellow-600 mt-1">
              This data is over {daysUntilWarning} days old. Please verify with your carrier.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
