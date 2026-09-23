import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  LINE_CONFIGS,
  PRIMARY_LINES,
  SECONDARY_LINES,
  ALL_LINES,
  lineLabel,
  stillNeededToQuote,
} from '@/config/intake/lineConfig';
import {
  PIPELINE_STAGES,
  PIPELINE_KINDS,
  OPEN_STAGES,
  CLOSED_STAGES,
  STAGE_LABELS,
  KIND_LABELS,
  LOST_REASONS,
  LOST_REASON_LABELS,
  STAGE_TO_LEAD_STATUS,
  stageLabel,
  kindLabel,
  isOpenStage,
} from '@/lib/pipeline/stages';

/**
 * These tests need no database. They cover the three things that are cheap to get
 * wrong and expensive to notice: the "still needed to quote" list the producer reads,
 * the stage vocabulary the whole pipeline shares, and the copy rule that no interface
 * text carries an em dash or an en dash.
 */

describe('the still needed to quote list', () => {
  it('names every blank field a carrier will want on a half filled home line', () => {
    const missing = stillNeededToQuote('home', {
      property_address: '118 Pine Hollow Rd',
      year_built: 1998,
      // roof_year, construction_type, dwelling_coverage and claims left blank on purpose
      current_carrier: 'Harbor Mutual',
    });

    expect(missing).toContain('Roof year');
    expect(missing).toContain('Construction');
    expect(missing).toContain('Dwelling amount');
    expect(missing).toContain('Claims in the last 5 years');

    // The ones that are filled must not be nagged about.
    expect(missing).not.toContain('Property address');
    expect(missing).not.toContain('Year built');
    // Current carrier is useful but no carrier refuses to quote without it.
    expect(missing).not.toContain('Current carrier');
  });

  it('says nothing is outstanding once the home line is complete', () => {
    const missing = stillNeededToQuote('home', {
      property_address: '118 Pine Hollow Rd',
      year_built: 1998,
      roof_year: 2017,
      construction_type: 'frame',
      dwelling_coverage: 285000,
      claims_last_5_years: 0,
    });
    expect(missing).toEqual([]);
  });

  it('asks for at least one vehicle and one driver when the auto line is empty', () => {
    const missing = stillNeededToQuote('auto', {}, { vehicles: [], drivers: [] });
    expect(missing).toContain('At least one vehicle');
    expect(missing).toContain('At least one driver');
  });

  it('names the blank field inside a repeatable card rather than the card itself', () => {
    const missing = stillNeededToQuote(
      'auto',
      {},
      {
        vehicles: [{ year: 2019, make: 'Toyota', model: '' }],
        drivers: [{ first_name: 'Sam', last_name: 'Alvarez', date_of_birth: '1980-04-02', license_state: 'FL' }],
      },
    );
    expect(missing).toContain('Vehicle model');
    expect(missing).not.toContain('Vehicle year');
    expect(missing).not.toContain('At least one vehicle');
    expect(missing.some((m) => m.startsWith('Driver'))).toBe(false);
  });

  it('treats a zero as answered, because zero claims is an answer', () => {
    const missing = stillNeededToQuote('home', {
      property_address: 'x',
      year_built: 1998,
      roof_year: 2017,
      construction_type: 'frame',
      dwelling_coverage: 285000,
      claims_last_5_years: 0,
    });
    expect(missing).not.toContain('Claims in the last 5 years');
  });
});

describe('the line configuration', () => {
  it('covers every line with a config, and splits them into the four up front and the five behind Show more', () => {
    expect(PRIMARY_LINES).toHaveLength(4);
    expect(SECONDARY_LINES).toHaveLength(5);
    expect(ALL_LINES).toHaveLength(9);
    for (const line of ALL_LINES) {
      expect(LINE_CONFIGS[line]).toBeDefined();
      expect(LINE_CONFIGS[line].fields.length).toBeGreaterThan(0);
      expect(lineLabel(line)).not.toEqual(line === LINE_CONFIGS[line].label ? '' : '');
    }
  });

  it('marks exactly the secondary lines as secondary', () => {
    for (const line of PRIMARY_LINES) expect(LINE_CONFIGS[line].secondary).toBeFalsy();
    for (const line of SECONDARY_LINES) expect(LINE_CONFIGS[line].secondary).toBe(true);
  });

  it('sends each line to a real storage target', () => {
    const allowed = ['lead_home_insurance', 'lead_auto', 'lead_commercial_insurance', 'lead_line_details'];
    for (const line of ALL_LINES) {
      expect(allowed).toContain(LINE_CONFIGS[line].storage);
    }
  });

  it('falls back to the raw key for a line it does not know', () => {
    expect(lineLabel('something_new')).toBe('something_new');
  });
});

describe('the stage vocabulary', () => {
  it('gives every stage a label', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
      expect(stageLabel(stage)).toBe(STAGE_LABELS[stage]);
    }
  });

  it('gives every kind a label', () => {
    for (const kind of PIPELINE_KINDS) {
      expect(KIND_LABELS[kind]).toBeTruthy();
      expect(kindLabel(kind)).toBe(KIND_LABELS[kind]);
    }
  });

  it('splits the stages into open and closed with nothing left over and nothing counted twice', () => {
    expect([...OPEN_STAGES, ...CLOSED_STAGES].sort()).toEqual([...PIPELINE_STAGES].sort());
    for (const stage of OPEN_STAGES) expect(isOpenStage(stage)).toBe(true);
    for (const stage of CLOSED_STAGES) expect(isOpenStage(stage)).toBe(false);
  });

  it('maps every stage onto a lead status the database check constraint accepts', () => {
    // The exact list from the leads_status_check constraint in production.
    const allowed = [
      'new',
      'contacted',
      'qualified',
      'quoted',
      'pending',
      'won',
      'lost',
      'nurturing',
      'disqualified',
    ];
    for (const stage of PIPELINE_STAGES) {
      expect(allowed).toContain(STAGE_TO_LEAD_STATUS[stage]);
    }
  });

  it('gives every lost reason a label', () => {
    for (const reason of LOST_REASONS) {
      expect(LOST_REASON_LABELS[reason]).toBeTruthy();
    }
  });

  it('falls back to the raw value rather than throwing on an unknown stage or kind', () => {
    expect(stageLabel('something_else')).toBe('something_else');
    expect(kindLabel('something_else')).toBe('something_else');
  });
});

describe('interface copy', () => {
  const EM_DASH = String.fromCharCode(8212);
  const EN_DASH = String.fromCharCode(8211);

  const roots = [
    'src/components/leadIntake',
    'src/components/pipeline',
    'src/config/intake',
    'src/lib/pipeline',
  ];
  const files = [
    'src/pages/NewLeadPage.tsx',
    'src/pages/PipelinePage.tsx',
    'src/hooks/usePipeline.ts',
    'src/hooks/useFeatureFlag.ts',
  ];

  function walk(dir: string): string[] {
    let out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out = out.concat(walk(full));
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it('carries no em dash and no en dash anywhere in the intake and pipeline surfaces', () => {
    const targets = [...files, ...roots.flatMap((r) => walk(r))];
    expect(targets.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const file of targets) {
      const source = readFileSync(file, 'utf8');
      if (source.includes(EM_DASH) || source.includes(EN_DASH)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('uses no hardcoded palette colours in the new surfaces', () => {
    const targets = [...files, ...roots.flatMap((r) => walk(r))].filter((f) => f.endsWith('.tsx'));
    const banned =
      /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

    const offenders: string[] = [];
    for (const file of targets) {
      const source = readFileSync(file, 'utf8');
      if (banned.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
