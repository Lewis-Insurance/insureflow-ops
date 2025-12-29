import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Link as LinkIcon } from 'lucide-react';
import { useCreateTrainingMaterial, useTrainingCategoriesFromMaterials } from '@/hooks/useTrainingMaterials';
import {
  createTrainingMaterialSchema,
  CreateTrainingMaterialInput,
  TrainingDifficulty,
} from '@/types/training';

interface AddTrainingMaterialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_CATEGORIES = [
  'Onboarding',
  'Product Knowledge',
  'Sales Techniques',
  'Carrier Training',
  'Compliance',
  'Technology',
];

const DIFFICULTY_OPTIONS: { value: TrainingDifficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export function AddTrainingMaterialDialog({
  open,
  onOpenChange,
}: AddTrainingMaterialDialogProps) {
  const [tagInput, setTagInput] = useState('');
  const createMaterial = useCreateTrainingMaterial();
  const { data: existingCategories = [] } = useTrainingCategoriesFromMaterials();

  // Combine default and existing categories
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...existingCategories])].sort();

  const form = useForm<CreateTrainingMaterialInput>({
    resolver: zodResolver(createTrainingMaterialSchema),
    defaultValues: {
      title: '',
      description: '',
      category: '',
      tags: [],
      gamma_url: '',
      thumbnail_url: '',
      duration_minutes: undefined,
      difficulty: 'beginner',
      is_required: false,
      sort_order: 0,
    },
  });

  const tags = form.watch('tags') || [];

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      form.setValue('tags', [...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    form.setValue('tags', tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const onSubmit = async (data: CreateTrainingMaterialInput) => {
    try {
      await createMaterial.mutateAsync(data);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Training Material</DialogTitle>
          <DialogDescription>
            Add a Gamma deck or other training material for your team.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Gamma URL */}
            <FormField
              control={form.control}
              name="gamma_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gamma Deck URL *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="https://gamma.app/docs/your-deck-title"
                        className="pl-10"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Paste the Gamma share URL for your training deck
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter training material title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of what this training covers"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category & Difficulty */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {allCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Difficulty</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Duration & Sort Order */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 15"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormDescription>
                      Estimated time to complete
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Lower numbers appear first
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tags */}
            <FormField
              control={form.control}
              name="tags"
              render={() => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a tag..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleAddTag}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="gap-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag)}
                              className="hover:bg-muted rounded-full"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <FormDescription>
                    Press Enter to add tags. Used for searching and filtering.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Required Training Toggle */}
            <FormField
              control={form.control}
              name="is_required"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Required Training</FormLabel>
                    <FormDescription>
                      Mark this as required training for all team members
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Thumbnail URL (optional) */}
            <FormField
              control={form.control}
              name="thumbnail_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thumbnail URL (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/thumbnail.jpg"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Custom thumbnail image URL for the card
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMaterial.isPending}>
                {createMaterial.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Training
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
