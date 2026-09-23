/**
 * Who is on it.
 *
 * Assignment here is a note to the office, not a permission. Anyone can add or
 * remove anyone, and nothing about visibility or access changes when they do. The
 * copy says so plainly so nobody treats this field as a lock.
 */

import { Check, UserPlus } from 'lucide-react';

import { SectionLabel, Skeleton } from '@/components/cc';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUpdatePipelineItem, useWorkspaceStaff, type PipelineItem } from '@/hooks/usePipeline';
import { cn } from '@/lib/utils';
import { initialsOf } from './PipelineCard';

export function AssigneePicker({ item }: { item: PipelineItem }) {
  const { data: staff = [], isLoading } = useWorkspaceStaff();
  const update = useUpdatePipelineItem();

  const toggle = (userId: string) => {
    const next = item.assignees.includes(userId)
      ? item.assignees.filter((id) => id !== userId)
      : [...item.assignees, userId];
    update.mutate({ id: item.id, assignees: next });
  };

  const current = item.assignees.map((id) => {
    const person = staff.find((s) => s.id === id);
    return { id, name: person?.full_name || person?.email || 'Unknown' };
  });

  return (
    <section className="space-y-2">
      <SectionLabel>Who is on it</SectionLabel>

      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? (
          <Skeleton className="h-7 w-32 rounded-pill" />
        ) : current.length === 0 ? (
          <span className="text-sm text-cc-text-muted">Nobody yet</span>
        ) : (
          current.map((person) => (
            <span
              key={person.id}
              className="inline-flex items-center gap-2 rounded-pill bg-cc-surface-overlay py-1 pl-1 pr-3 text-sm text-cc-text-secondary"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-pill bg-cc-surface-raised text-[10px] font-semibold text-cc-text-secondary">
                {initialsOf(person.name)}
              </span>
              {person.name}
            </span>
          ))
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              className="h-8 gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Change
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-64 rounded-cc-lg border-cc-border-strong bg-cc-surface-overlay p-1 shadow-lift"
          >
            <div className="max-h-64 overflow-y-auto">
              {staff.length === 0 ? (
                <p className="px-3 py-3 text-sm text-cc-text-muted">
                  No staff on this workspace yet.
                </p>
              ) : (
                staff.map((person) => {
                  const on = item.assignees.includes(person.id);
                  const name = person.full_name || person.email || 'Unknown';
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggle(person.id)}
                      aria-pressed={on}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-cc-sm px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-cc-surface-raised',
                        on ? 'text-cc-text-primary' : 'text-cc-text-secondary',
                      )}
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-cc-surface-raised text-[10px] font-semibold text-cc-text-secondary">
                        {initialsOf(name)}
                      </span>
                      <span className="min-w-0 flex-1 break-words">{name}</span>
                      {on && <Check className="h-3.5 w-3.5 shrink-0 text-cc-accent" aria-hidden="true" />}
                      {on && <span className="sr-only">On it</span>}
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <p className="text-xs text-cc-text-muted">
        Anyone can change this. It is a note to the office, not a permission.
      </p>
    </section>
  );
}
