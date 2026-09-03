/**
 * The triage strip.
 *
 * Each tile is a filter, not a scoreboard. Clicking one narrows the board or the
 * list to it and clicking it again lets go. The premium under Quoted and Proposed
 * is the money actually in play: the best quote on each item, added up, on a yearly
 * basis so a six month quote does not read as half a sale.
 */

import { useMemo } from 'react';

import { TriageTile } from '@/components/cc';
import type { PipelineItem } from '@/hooks/usePipeline';
import { differenceFromTodayInLocalDays } from '@/lib/date/localDate';
import { isOpenStage } from '@/lib/pipeline/stages';
import { bestPremiumAnnual, formatMoney } from './PipelineCard';

export type TileKey = 'working' | 'quoted' | 'proposed' | 'follow_up_due' | 'bound_month';

function inCurrentMonth(stamp: string | null | undefined): boolean {
  if (!stamp) return false;
  const closed = new Date(stamp);
  if (Number.isNaN(closed.getTime())) return false;
  const now = new Date();
  return closed.getFullYear() === now.getFullYear() && closed.getMonth() === now.getMonth();
}

/** The one definition of what each tile selects, shared by the counts and the filter. */
export function tileMatches(key: TileKey, item: PipelineItem): boolean {
  switch (key) {
    case 'working':
      return item.stage === 'working';
    case 'quoted':
      return item.stage === 'quoted';
    case 'proposed':
      return item.stage === 'proposed';
    case 'follow_up_due': {
      if (!isOpenStage(item.stage)) return false;
      const days = differenceFromTodayInLocalDays(item.next_follow_up_date);
      return days !== null && days <= 0;
    }
    case 'bound_month':
      return item.stage === 'bound' && inCurrentMonth(item.bound_at ?? item.updated_at);
    default:
      return false;
  }
}

function sumBestPremium(items: PipelineItem[]): number {
  return items.reduce((total, item) => total + (bestPremiumAnnual(item) ?? 0), 0);
}

interface PipelineTilesProps {
  items: PipelineItem[];
  active: TileKey | null;
  onToggle: (key: TileKey) => void;
}

export function PipelineTiles({ items, active, onToggle }: PipelineTilesProps) {
  const stats = useMemo(() => {
    const working = items.filter((i) => tileMatches('working', i));
    const quoted = items.filter((i) => tileMatches('quoted', i));
    const proposed = items.filter((i) => tileMatches('proposed', i));
    const followUp = items.filter((i) => tileMatches('follow_up_due', i));
    const bound = items.filter((i) => tileMatches('bound_month', i));

    return {
      working: working.length,
      quoted: quoted.length,
      quotedPremium: sumBestPremium(quoted),
      proposed: proposed.length,
      proposedPremium: sumBestPremium(proposed),
      followUp: followUp.length,
      bound: bound.length,
      boundPremium: sumBestPremium(bound),
    };
  }, [items]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <TriageTile
        label="Working"
        count={stats.working}
        sub="Keep them moving"
        active={active === 'working'}
        onClick={() => onToggle('working')}
      />
      <TriageTile
        label="Quoted"
        count={stats.quoted}
        sub={`${formatMoney(stats.quotedPremium)} in play`}
        active={active === 'quoted'}
        onClick={() => onToggle('quoted')}
      />
      <TriageTile
        label="Proposed"
        count={stats.proposed}
        sub={`${formatMoney(stats.proposedPremium)} in play`}
        active={active === 'proposed'}
        onClick={() => onToggle('proposed')}
      />
      <TriageTile
        label="Follow-up due"
        count={stats.followUp}
        sub={stats.followUp > 0 ? 'Call these today' : 'Nothing due'}
        tone={stats.followUp > 0 ? 'warning' : 'neutral'}
        active={active === 'follow_up_due'}
        onClick={() => onToggle('follow_up_due')}
      />
      <TriageTile
        label="Bound this month"
        count={stats.bound}
        sub={`${formatMoney(stats.boundPremium)} written`}
        active={active === 'bound_month'}
        onClick={() => onToggle('bound_month')}
      />
    </div>
  );
}
