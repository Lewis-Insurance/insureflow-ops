import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Eye, CheckCircle2, Play, Star, BookOpen } from 'lucide-react';
import type { TrainingMaterialWithProgress, TrainingStatus } from '@/types/training';
import { difficultyColors, statusColors, categoryColors } from '@/types/training';
import { cn } from '@/lib/utils';

interface TrainingMaterialCardProps {
  material: TrainingMaterialWithProgress;
  onView: (material: TrainingMaterialWithProgress) => void;
}

export function TrainingMaterialCard({ material, onView }: TrainingMaterialCardProps) {
  const statusIcon = {
    not_started: <Play className="h-4 w-4" />,
    in_progress: <BookOpen className="h-4 w-4" />,
    completed: <CheckCircle2 className="h-4 w-4" />,
  };

  const statusText = {
    not_started: 'Start',
    in_progress: 'Continue',
    completed: 'Review',
  };

  const getCategoryColor = (category: string) => {
    return categoryColors[category] || 'bg-gray-500';
  };

  return (
    <Card
      className={cn(
        'group cursor-pointer transition-all hover:shadow-lg hover:border-primary/50',
        material.user_status === 'completed' && 'border-green-200 bg-green-50/30'
      )}
      onClick={() => onView(material)}
    >
      <CardHeader className="space-y-2 pb-3">
        {/* Category & Required badges */}
        <div className="flex items-center justify-between">
          <Badge
            variant="secondary"
            className={cn('text-white text-xs', getCategoryColor(material.category))}
          >
            {material.category}
          </Badge>
          <div className="flex items-center gap-1">
            {material.is_required && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                <Star className="h-3 w-3 mr-1 fill-amber-500" />
                Required
              </Badge>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {material.title}
        </h3>

        {/* Description */}
        {material.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {material.description}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0 pb-3">
        {/* Tags */}
        {material.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {material.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {material.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{material.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {/* Difficulty */}
          <Badge className={cn('text-xs', difficultyColors[material.difficulty])}>
            {material.difficulty}
          </Badge>

          {/* Duration */}
          {material.duration_minutes && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {material.duration_minutes} min
            </span>
          )}

          {/* View count */}
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {material.view_count}
          </span>
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        {/* Progress status & action */}
        <div className="w-full flex items-center justify-between">
          <Badge
            className={cn('text-xs', statusColors[material.user_status as TrainingStatus])}
          >
            {material.user_status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {material.user_status === 'not_started' ? 'Not Started' :
             material.user_status === 'in_progress' ? 'In Progress' : 'Completed'}
          </Badge>

          <Button
            size="sm"
            variant={material.user_status === 'completed' ? 'outline' : 'default'}
            className="gap-1"
            onClick={(e) => {
              e.stopPropagation();
              onView(material);
            }}
          >
            {statusIcon[material.user_status as TrainingStatus]}
            {statusText[material.user_status as TrainingStatus]}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
