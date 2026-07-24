import { describe, expect, it } from 'vitest';

import { parseArgs } from '../../src/cli/args.js';

describe('parseArgs — §11.1 grammar', () => {
  it('defaults the scan path to "."', () => {
    expect(parseArgs(['scan'])).toEqual({
      command: 'scan',
      path: '.',
      flags: { json: false, offline: false },
    });
  });

  it('accepts a positional scan path', () => {
    expect(parseArgs(['scan', './my-app'])).toMatchObject({ command: 'scan', path: './my-app' });
  });

  it('parses the --json and --offline booleans', () => {
    expect(parseArgs(['scan', '--json', '--offline'])).toMatchObject({
      command: 'scan',
      flags: { json: true, offline: true },
    });
  });

  it('parses the --out and --app value flags', () => {
    expect(parseArgs(['scan', '--out', 'dist', '--app', 'apps/web'])).toMatchObject({
      command: 'scan',
      flags: { out: 'dist', app: 'apps/web' },
    });
  });

  it('splits --checks on commas (single and multiple)', () => {
    expect(parseArgs(['scan', '--checks', 'LG-001,LG-004'])).toMatchObject({
      flags: { checks: ['LG-001', 'LG-004'] },
    });
    expect(parseArgs(['scan', '--checks', 'LG-001'])).toMatchObject({
      flags: { checks: ['LG-001'] },
    });
  });

  it('trims whitespace and drops empty --checks entries', () => {
    expect(parseArgs(['scan', '--checks', 'LG-001, LG-004,'])).toMatchObject({
      flags: { checks: ['LG-001', 'LG-004'] },
    });
  });

  it('parses the eval command with no path', () => {
    expect(parseArgs(['eval'])).toEqual({ command: 'eval', flags: { json: false, offline: false } });
  });

  it('combines a path with several flags', () => {
    expect(parseArgs(['scan', 'apps/web', '--json', '--checks', 'LG-001', '--out', 'o'])).toEqual({
      command: 'scan',
      path: 'apps/web',
      flags: { json: true, offline: false, checks: ['LG-001'], out: 'o' },
    });
  });

  it('errors when no command is given', () => {
    expect(parseArgs([])).toHaveProperty('error');
  });

  it('errors on an unknown command', () => {
    expect(parseArgs(['frobnicate'])).toHaveProperty('error');
  });

  it('errors on an unknown flag', () => {
    expect(parseArgs(['scan', '--nope'])).toHaveProperty('error');
  });

  it('errors when a value flag is missing its value', () => {
    expect(parseArgs(['scan', '--out'])).toHaveProperty('error');
    expect(parseArgs(['scan', '--checks'])).toHaveProperty('error');
    expect(parseArgs(['scan', '--app'])).toHaveProperty('error');
  });

  it('errors on a second scan positional', () => {
    expect(parseArgs(['scan', 'a', 'b'])).toHaveProperty('error');
  });

  it('errors when eval is given a positional', () => {
    expect(parseArgs(['eval', 'x'])).toHaveProperty('error');
  });
});
