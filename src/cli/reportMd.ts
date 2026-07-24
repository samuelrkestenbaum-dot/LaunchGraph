/**
 * §11.3 human evidence package — `report.md`.
 *
 * Renders a §5 `Report` into the deterministic markdown report: a decision
 * header, blockers before warnings, every finding with its evidence path, a
 * confidence/classification qualifier (§6.2), and the ALREADY-REDACTED excerpt
 * carried on the finding (SEC-4 — this renderer never touches raw repository
 * text and never re-derives an excerpt). External-verification items and
 * "needs your confirmation" items get their own sections, and the §7 Phase-1
 * decision ceiling is stated wherever external verification pends.
 *
 * Pure and deterministic: output depends only on the report (the sole
 * time-varying input, `scannedAt`, is already baked into the report).
 *
 * The finding-categorization and qualifier helpers are exported so the terminal
 * banner (banner.ts) draws its categories from the same single source of truth.
 */
import type { Finding, Report } from '../schema/index.js';

/** Last POSIX path segment. */
function baseName(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

/** Human decision label for the header line. */
export function decisionLabel(value: Report['decision']['value']): string {
  switch (value) {
    case 'not_ready':
      return 'NOT READY';
    case 'ready_with_warnings':
      return 'READY WITH WARNINGS';
    case 'ready':
      return 'READY';
    case 'not_evaluated':
      return 'NOT EVALUATED (unsupported stack)';
  }
}

export interface FindingCategories {
  /** Standing blocker failures (drive `not_ready`). */
  blockers: Finding[];
  /** Warning-level defects (warning outcomes + warning-severity fails). */
  warnings: Finding[];
  /** Blocker fails reclassified `requires_confirmation` (§7 rules 4–5). */
  needsConfirmation: Finding[];
  /** Findings with a pending external (Phase-3) verification (§1.2/§7). */
  pendingExternal: Finding[];
}

/**
 * Splits findings into the report's presentation buckets, mirroring the §7
 * decision engine's counting so the report never disagrees with the decision.
 * A finding can appear in more than one bucket (e.g. a warning-severity fail
 * that also carries an external-verification marker).
 */
export function categorize(findings: readonly Finding[]): FindingCategories {
  const blockers: Finding[] = [];
  const warnings: Finding[] = [];
  const needsConfirmation: Finding[] = [];
  const pendingExternal: Finding[] = [];

  for (const f of findings) {
    const requiresConfirmation = f.classification === 'requires_confirmation';
    if (f.severity === 'blocker' && f.outcome === 'fail' && requiresConfirmation) {
      needsConfirmation.push(f);
    } else if (f.severity === 'blocker' && f.outcome === 'fail') {
      blockers.push(f);
    } else if (
      f.outcome === 'warning' ||
      (f.outcome === 'fail' && f.severity === 'warning')
    ) {
      warnings.push(f);
    }
    if (f.externalVerification !== undefined || f.classification === 'unverified') {
      pendingExternal.push(f);
    }
  }

  return { blockers, warnings, needsConfirmation, pendingExternal };
}

/**
 * §6.2 confidence/classification qualifier for the human report.
 * `confirmed` renders as "confirmed"; external-pending as unverified; low
 * confidence renders as a question rather than an assertion.
 */
export function qualifier(finding: Finding): string {
  switch (finding.classification) {
    case 'confirmed':
      return 'confirmed';
    case 'unverified':
      return 'unverified — requires provider access (Phase 3)';
    case 'requires_confirmation':
      return 'needs your confirmation';
    case 'contradictory':
      return 'contradictory — needs review';
    case 'inferred':
      if (finding.confidence >= 0.8) return 'high confidence';
      if (finding.confidence >= 0.6) return 'moderate confidence';
      return 'needs your confirmation';
  }
}

/** The §7 Phase-1 ceiling statement, emitted wherever external verification pends. */
export const PHASE_1_CEILING =
  'Phase 1 ceiling: this scan verifies repository evidence only, so it can reach at ' +
  'best `ready_with_warnings`. The external half of the items below is deferred to ' +
  'Phase 3; the unqualified `ready` requires that external verification, which Phase 1 ' +
  'never performs.';

function evidenceLine(finding: Finding): string {
  const lines: string[] = [];
  for (const e of finding.evidence) {
    const span = e.endLine > e.startLine ? `${e.startLine}-${e.endLine}` : `${e.startLine}`;
    const note = e.note !== undefined ? ` — ${e.note}` : '';
    lines.push(`- \`${e.path}:${span}\` (${e.kind})${note}`);
    if (e.excerpt.length > 0) {
      // The excerpt is already secret-redacted upstream (SEC-4); rendered verbatim.
      lines.push('', '  ```', ...e.excerpt.split('\n').map((l) => `  ${l}`), '  ```');
    }
  }
  return lines.join('\n');
}

function renderFinding(finding: Finding): string {
  const label = finding.severity.toUpperCase();
  const parts = [
    `### ${label} ${finding.checkId} — ${finding.title}  (${qualifier(finding)})`,
    '',
    finding.summary,
  ];
  if (finding.evidence.length > 0) {
    parts.push('', evidenceLine(finding));
  }
  return parts.join('\n');
}

function renderSection(title: string, findings: readonly Finding[]): string {
  const body = findings.length === 0 ? 'None.' : findings.map(renderFinding).join('\n\n');
  return `## ${title}\n\n${body}`;
}

/** Renders a §5 `Report` to the §11.3 human `report.md`. */
export function renderReportMd(report: Report): string {
  const { blockers, warnings, needsConfirmation, pendingExternal } = categorize(report.findings);
  const name = baseName(report.repo.root);
  const heading = report.repo.commit !== null ? `${name} @ ${report.repo.commit}` : name;

  const stack =
    report.stack.length === 0
      ? 'No supported Next.js/TypeScript stack detected.'
      : report.stack.map((s) => `${s.provider} (${s.support})`).join(' · ');

  const sections: string[] = [
    `# LaunchGraph scan — ${heading}`,
    '',
    `- Scanned at: ${report.scannedAt}`,
    `- Decision: **${decisionLabel(report.decision.value)}**`,
    `- Blockers: ${report.counts.blockers} · Warnings: ${report.counts.warnings} · Unknowns: ${report.counts.unknowns}`,
    '',
    '## Stack',
    '',
    stack,
    '',
    `## Decision — ${decisionLabel(report.decision.value)}`,
    '',
    report.decision.reasons.length === 0
      ? 'No rules fired.'
      : report.decision.reasons.map((r) => `- ${r}`).join('\n'),
  ];

  if (pendingExternal.length > 0) {
    sections.push('', PHASE_1_CEILING);
  }

  sections.push('', renderSection(`Blockers (${blockers.length})`, blockers));
  sections.push('', renderSection(`Warnings (${warnings.length})`, warnings));

  if (needsConfirmation.length > 0) {
    sections.push('', renderSection(`Needs your confirmation (${needsConfirmation.length})`, needsConfirmation));
  }

  if (pendingExternal.length > 0) {
    const items = pendingExternal
      .map((f) => {
        const ev = f.externalVerification;
        const provider = ev !== undefined ? ev.provider : 'provider';
        const what = ev !== undefined ? ev.what : 'external state';
        const path = f.evidence[0]?.path ?? '(no path)';
        return `- ${f.checkId} (${provider}): ${what} — \`${path}\` · unverified, Phase 3.`;
      })
      .join('\n');
    sections.push('', `## External verification (Phase 3)`, '', PHASE_1_CEILING, '', items);
  }

  return `${sections.join('\n')}\n`;
}
