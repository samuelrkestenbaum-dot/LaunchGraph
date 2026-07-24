/**
 * §11.2 terminal banner.
 *
 * Renders a §5 `Report` into the decision-first terminal experience: the
 * decision line first, then the stack, then blockers before warnings — each
 * finding with its evidence path and a confidence/classification qualifier
 * (§6.2) — followed by "needs your confirmation" and external-verification
 * sections, with the §7 Phase-1 ceiling stated when external verification pends.
 *
 * Pure and deterministic: it draws its finding categories and qualifiers from
 * the same helpers as `report.md` (reportMd.ts), so the terminal and the file
 * never disagree. It consumes only already-redacted evidence paths — it never
 * touches raw repository text (SEC-4). The "Report: <paths>" footer is added by
 * `run.ts`, which alone knows the output directory.
 */
import type { Finding, Report } from '../schema/index.js';
import { PHASE_1_CEILING, categorize, decisionLabel, qualifier } from './reportMd.js';

/** Last POSIX path segment. */
function baseName(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

/** `path:line` locator for a finding's first evidence entry, if any. */
function locator(finding: Finding): string {
  const first = finding.evidence[0];
  if (first === undefined) return '(no evidence)';
  return `${first.path}:${first.startLine}`;
}

function findingLines(tag: string, findings: readonly Finding[]): string[] {
  const out: string[] = [];
  for (const f of findings) {
    out.push(`${tag.padEnd(7)}  ${f.checkId}  ${f.summary}`);
    out.push(`         ${locator(f)}  (${qualifier(f)})`);
  }
  return out;
}

/** Renders a §5 `Report` to the §11.2 terminal banner (no trailing file footer). */
export function renderBanner(report: Report): string {
  const { blockers, warnings, needsConfirmation, pendingExternal } = categorize(report.findings);
  const name = baseName(report.repo.root);
  const heading = report.repo.commit !== null ? `${name} @ ${report.repo.commit}` : name;

  const lines: string[] = [`SugarBee.ai scan — ${heading}`, ''];

  const stack =
    report.stack.length === 0 ? 'none detected' : report.stack.map((s) => s.provider).join(' · ');
  lines.push(`Stack: ${stack}`);
  if (report.product.inferredModel !== 'unknown' && report.product.inferredModel.length > 0) {
    lines.push(`Inferred product: ${report.product.inferredModel}`);
  }
  lines.push('');

  const decisionSummary =
    `${decisionLabel(report.decision.value)} — ` +
    `${report.counts.blockers} blocker(s), ${report.counts.warnings} warning(s)` +
    (pendingExternal.length > 0 ? `, ${pendingExternal.length} pending external verification(s)` : '');
  lines.push(decisionSummary);

  if (blockers.length > 0) {
    lines.push('', ...findingLines('BLOCKER', blockers));
  }
  if (warnings.length > 0) {
    lines.push('', ...findingLines('WARNING', warnings));
  }
  if (needsConfirmation.length > 0) {
    lines.push('', 'Needs your confirmation:', ...findingLines('CONFIRM', needsConfirmation));
  }
  if (pendingExternal.length > 0) {
    lines.push('', 'External verification (Phase 3):');
    for (const f of pendingExternal) {
      const provider = f.externalVerification?.provider ?? 'provider';
      const what = f.externalVerification?.what ?? 'external state';
      lines.push(`         ${f.checkId} (${provider}): ${what} — ${locator(f)}`);
    }
    lines.push('', PHASE_1_CEILING);
  }

  return `${lines.join('\n')}\n`;
}
