import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  ExternalLink,
  X,
  Clock,
  Star,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { TrainingMaterialWithProgress } from '@/types/training';
import { difficultyColors, categoryColors } from '@/types/training';
import { useCompleteTraining, useStartTrainingProgress } from '@/hooks/useTrainingMaterials';
import { cn } from '@/lib/utils';

interface TrainingMaterialViewerProps {
  material: TrainingMaterialWithProgress | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrainingMaterialViewer({
  material,
  open,
  onOpenChange,
}: TrainingMaterialViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const startProgress = useStartTrainingProgress();
  const completeTraining = useCompleteTraining();

  // Track progress when material is opened
  useEffect(() => {
    if (open && material) {
      startProgress.mutate(material.id);
      setIsLoading(true);
    }
  }, [open, material?.id]);

  if (!material) return null;

  const handleMarkComplete = () => {
    completeTraining.mutate(material.id);
  };

  const handleOpenExternal = () => {
    window.open(material.gamma_url, '_blank');
  };

  const getCategoryColor = (category: string) => {
    return categoryColors[category] || 'bg-gray-500';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex flex-col gap-0 p-0',
          isFullscreen
            ? 'max-w-[100vw] w-[100vw] h-[100vh] max-h-[100vh] rounded-none'
            : 'max-w-[95vw] w-[1400px] h-[90vh] max-h-[90vh]'
        )}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  variant="secondary"
                  className={cn('text-white text-xs', getCategoryColor(material.category))}
                >
                  {material.category}
                </Badge>
                <Badge className={cn('text-xs', difficultyColors[material.difficulty])}>
                  {material.difficulty}
                </Badge>
                {material.is_required && (
                  <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                    <Star className="h-3 w-3 mr-1 fill-amber-500" />
                    Required
                  </Badge>
                )}
                {material.duration_minutes && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {material.duration_minutes} min
                  </span>
                )}
              </div>
              <DialogTitle className="text-xl truncate">{material.title}</DialogTitle>
              {material.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                  {material.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {material.user_status !== 'completed' && (
                <Button
                  onClick={handleMarkComplete}
                  disabled={completeTraining.isPending}
                  className="gap-2"
                >
                  {completeTraining.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Mark Complete
                </Button>
              )}
              {material.user_status === 'completed' && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Completed
                </Badge>
              )}
              <Button variant="outline" size="icon" onClick={handleOpenExternal}>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Iframe container */}
        <div className="flex-1 relative overflow-hidden bg-muted">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading training material...</p>
              </div>
            </div>
          )}
          <iframe
            src={material.embed_url}
            className="w-full h-full border-0"
            title={material.title}
            allow="fullscreen"
            onLoad={() => setIsLoading(false)}
          />
        </div>

        {/* Footer with tags */}
        {material.tags.length > 0 && (
          <div className="px-6 py-3 border-t shrink-0 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tags:</span>
              <div className="flex flex-wrap gap-1">
                {material.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
