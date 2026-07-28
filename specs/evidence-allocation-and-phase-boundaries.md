# SugarBee.ai: Evidence-Method Allocation and Phase Boundaries

- **Status:** Specification — normative for evidence-source allocation and
  phase ownership only. See the precedence clause (§1).
- **Parent documents:** [`PRODUCT_SCOPE.md`](../PRODUCT_SCOPE.md) §35 (the
  phase map) and
  [`specs/phase-1-repository-auditor.md`](phase-1-repository-auditor.md)
  §3 (check definitions) and §13 (the deferral table).
- **Mode:** This document is a **refinement of an existing approved
  allocation**, not a new theory. §35 already assigns the phases; §13 already
  encodes most of this allocation. Nothing here invents a phase, and nothing
  here authorizes a capability.

---

## 1. Precedence (normative)

**§3 of `specs/phase-1-repository-auditor.md` remains the sole authority for
what a check means.** This document does not define, redefine, widen, narrow,
or reinterpret a single check. Where any statement here can be read as
altering a check's meaning, severity, layer assignment, outcome vocabulary, or
acceptance criteria, **§3 wins and this document is wrong.**

This document is normative for exactly two things:

1. **Evidence-source allocation** — which class of evidence holds the
   authoritative fact for each check.
2. **Phase ownership** — which `PRODUCT_SCOPE.md` §35 phase owns the work of
   obtaining that evidence.

Three further sections are **additionally normative, and are restrictions
only — they grant nothing**: §4 (FORBIDDEN IN PHASE 1), §5.3 (the ceiling
gate), and §6 (the LG-009 non-deletion clause). Each may only tighten what a
later packet may do; none may widen it, and none may be read as permission.
§4 additionally restates constraints that bind independently from `P1§10`
whether or not this document exists.

It is non-normative for everything else. §8 is explicitly non-normative in
full, including for those two things.

**A phase number is not evidence.** Naming a phase in this document allocates
*work*; it never asserts that the external fact is known, and it never
licenses a check to behave as though it were.

## 2. The strategic reframing (recorded)

Recorded verbatim:

> SugarBee is the AI launch assurance layer. It combines repository analysis,
> provider state, and live customer-journey evidence, then coordinates agents
> and tools to close the gaps.

The consequence for this document: the defensible moat is not any single
detector. It is

- **selecting the right evidence source** for each question rather than
  forcing every question through the one source that happens to be cheap;
- **connecting repository, provider, and runtime truth** into a single
  reconciled picture;
- **routing remediation** to the agent or human who can actually close the
  gap;
- **independently checking the result** rather than trusting the fixer's own
  report; and
- **producing one coherent launch decision** from all of it.

Phase 1 builds the first evidence source and the honest ceiling that follows
from having only that one. It does not weaken the claim; it scopes it.

## 3. The allocation matrix

### 3.1 The four evidence modes

| Mode | What it establishes | Can it be faked by another mode? |
|---|---|---|
| **Repository analysis** | Code semantics, configuration as written, and *missing implementation* — the class of fact that is true because of what the source does or does not contain. | No. A provider cannot report what your code omits. |
| **Provider-native inspection** | Actual account and infrastructure state — what is registered, enabled, verified, or configured at the vendor, as distinct from what the repository intends. | No. A repository cannot report state it does not hold. |
| **Live probes** | Observable customer behaviour and security outcomes — what actually happens end to end when a real request traverses the deployed system. | No. Intent plus configuration is not behaviour. |
| **Agent remediation** | Not evidence. The act of fixing and reconciling findings, and the re-verification that follows. | n/a |

The matrix below assigns each of the 15 checks to the mode that holds its
**authoritative** fact — the fact a reasonable person would accept as
settling the question.

### 3.2 Column semantics

The matrix is one 15-row allocation presented in two panels sharing the check
id as key. Both panels carry **exactly 15 rows**, and the id set is exactly
§3's id set: LG-001 … LG-015.

- **Authoritative evidence source (general rule)** — *who holds the fact.*
  Durable. Changes only if the check's meaning changes.
- **Vendor mechanism today** — *how the fact is fetched.* Descriptive,
  **non-normative**, and expected to rot. A vendor renaming or replacing a
  surface changes this column and nothing else. Do not read a mechanism as a
  commitment to that vendor or that endpoint.
- **Repo sufficient? / Provider authoritative? / Probe required?** — answered
  against the general rule, not the mechanism.
- **Posture** — `build` (SugarBee derives the fact itself), `consume`
  (SugarBee reads an authoritative fact it does not own), `orchestrate`
  (SugarBee routes remediation and re-verifies). The column names the
  *primary* posture for the authoritative fact. **Orchestration applies to
  all 15 rows** by §8 of the Phase 1 spec and is therefore not repeated.
- **Shipped Phase-1 behaviour TODAY** — descriptive and **frozen**. It records
  what the code does at the time of writing. It is not a target, and this
  document changes none of it.

### 3.3 Panel A — decision and evidence allocation

> **No row in this panel describes present permission.** Panel A answers *who
> holds the fact*; the owning phase, the shipped behaviour, and the cost of
> obtaining the fact live in Panel B (§3.4), and what a Phase-1 detector may
> actually do is fixed by §4. A Panel A row read alone says nothing about what
> is permitted today.

| ID | Customer decision being made | Authoritative evidence source (general rule) | Repo sufficient? | Provider authoritative? | Live probe required? |
|---|---|---|---|---|---|
| LG-001 | Will my users be bounced to a development origin after login or checkout? | Repository — production-designated configuration as written | Yes, where the production URL mapping exists in-repo | No (corroborative only, where the mapping is dashboard-held) | No |
| LG-002 | Am I about to run production against test-mode payment credentials, or leak live ones? | Repository — a key committed or mis-scoped in-repo is a repository fact | Yes | No | No |
| LG-003 | Will Stripe actually tell my app when a subscription changes? | **Split.** (a) handler exists and subscribes to required events → repository. (b) endpoint registered, addressed, and subscribed at Stripe → provider | (a) Yes · (b) No | (a) No · (b) **Yes** | No |
| LG-004 | Can anyone forge a webhook call into my billing logic? | Repository — whether the handler validates the signature is application semantics | Yes | No | No |
| LG-005 | Will a duplicate delivery double-charge, double-provision, or double-send? | Repository — idempotency is a property of the handling code, not of the vendor | Yes | No | No |
| LG-006 | When a customer cancels, does access actually go away? | Repository — whether a cancellation branch reaches an entitlement downgrade is application semantics | Yes | No | No (Phase-6 corroboration only) |
| LG-007 | Does paying me actually grant the thing paid for? | Repository — the success-event-to-entitlement path is application semantics | Yes | No | No (Phase-6 corroboration only) |
| LG-008 | Is my preview environment writing to my customers' production database? | **Repository where env separation is in-repo; provider where the mapping is dashboard-held** | Partially — §3 already returns `unknown` for the dashboard-only case | Yes, for the dashboard-held mapping | No |
| LG-009 | Can one tenant read another tenant's rows? | **Provider** — the deployed database's actual RLS state and the role the runtime connection authenticates as (see §3.7) — **proposed, §9.1; `P1§3` marks LG-009 `External component: No` and that cell wins today** | **No** | **Yes (primary, proposed)** | No for the RLS fact; a cross-tenant read is the strongest corroboration (Phase 6) |
| LG-010 | Will my transactional email land in spam or be rejected? | Provider — the sending domain's authentication status at the email provider, backed by published DNS records | No, for the external half | **Yes** | Corroborative: a DNS/TLS probe reads the published records directly |
| LG-011 | Do the links I email customers point at production? | Repository — the origin the code resolves under production configuration | Yes | No | No (Phase-6 corroboration only) |
| LG-012 | Can a locked-out customer get back in? | **Split.** (a) no recovery flow exists at all → repository, blocking. (b) an existing flow's end-to-end behaviour → live probe | (a) Yes · (b) No | (a) No · (b) Corroborative only | (a) No · (b) **Yes** |
| LG-013 | Will I be able to see whether anyone signed up or bought? | Repository — whether a capture call is reachable from the signup and checkout flows (§3's definition) | Yes | No (arrival is corroborative, not the defined defect) | No |
| LG-014 | If production breaks, will I find out? | Provider — whether events actually arrive at the error tracker | No, for the external half | **Yes** | No |
| LG-015 | Does my domain resolve, serve TLS, and match what the app thinks it is? | **Split authority:** repository for in-repo canonical-URL consistency; DNS/TLS reality for resolution | No, for the external half | Yes, for domain attachment at the host | **Yes** — DNS/TLS resolution is a probe fact |

### 3.4 Panel B — posture, ownership, shipped behaviour, cost

| ID | Posture | Owning §35 phase | Vendor mechanism today (non-normative) | Shipped Phase-1 behaviour TODAY (frozen) | Cost / obligation (consume rows) |
|---|---|---|---|---|---|
| LG-001 | build | **Phase 1** (`PRODUCT_SCOPE.md:1598`) | n/a | Implemented. Emits `fail` / `pass` / `unknown`; deterministic. | — |
| LG-002 | build | **Phase 1** (`:1598`) | n/a | Implemented. Emits `fail` / `pass` / `not_applicable`; deterministic, failures `confirmed`. | — |
| LG-003 | (a) build · (b) consume | (a) **Phase 1** (`:1598`) · (b) **Phase 3 — Provider inspector and router** (`:1626`), already in §13 at `specs/phase-1-repository-auditor.md:647` | (b) Stripe webhook-endpoint listing | Implemented. Emits `not_applicable` / `fail` / `pass`; the pass branch is classified `unverified` and carries the external half explicitly. | (b) Stripe API credential with read scope, custody obligation, rate limits, per-account read latency, vendor coupling. |
| LG-004 | build | **Phase 1** (`:1598`) | n/a | Implemented. Emits `fail` / `pass` / `not_applicable`; deterministic. | — |
| LG-005 | build | **Phase 1** (`:1598`) — with a named open defect, §7.1 | n/a | Implemented. Offline: `not_applicable` / `unknown`. Online: a model verdict yields `fail` or `pass`, classified at best `inferred`. | — |
| LG-006 | build | **Phase 1** (`:1598`) | n/a | Implemented. Emits `not_applicable` / `fail` / `unknown`; D half deterministic, M half model-assisted. | — |
| LG-007 | build | **Phase 1** (`:1598`) | n/a | **Not implemented.** No detector registered. | — |
| LG-008 | (repo) build · (dashboard) consume | (repo) **Phase 1** (`:1598`) · (dashboard) **Phase 3** (`:1626`), under `:646` read-only provider API inspection | Vercel per-environment environment-variable listing | Implemented. Emits `not_applicable` / `fail` / `unknown`; returns `unknown` where the mapping is dashboard-only. | Vercel API credential with read scope, custody obligation, rate limits, vendor coupling; the dashboard values are themselves secret-bearing and must never be materialized into a report. |
| LG-009 | consume (primary, **proposed**) · build (the repository-side half, unchanged) | **Phase 3** (`:1626`) for the certifying half — **NOT yet in §13; LG-009 is absent from the `:647` external-resolution row, and `P1§3` marks it `External component: No`. Proposed amendment §9.1; not enacted.**; the shipped repository half stays **Phase 1** (`:1598`) | Supabase Security Advisors / Splinter lint results, plus the identity of the connecting role | Implemented, and **unchanged by this document**. Emits only `not_applicable` / `unknown` / capped-`inferred`. **Both deterministic branches remain withheld** — no `confirmed` fail, no `confirmed` pass. See §6. | Supabase management credential with read scope, custody obligation, rate limits, per-project read latency, vendor coupling; advisor output is untrusted data (§8, SEC-5′). |
| LG-010 | (repo) build · (external) consume | (repo) **Phase 1** (`:1598`) · (external) **Phase 3** (`:1626`), already in §13 at `:647` and `:648` | Resend domain-verification status; DNS record lookup for SPF/DKIM/DMARC | Implemented. Emits `not_applicable` / `fail` / `pass`; the pass branch is classified `unverified`. **No DNS queries are performed** (§3, LG-015; SEC-2). | Resend API credential with read scope, custody obligation, rate limits; DNS lookups add a second egress class that Phase 1 forbids outright (§4). |
| LG-011 | build | **Phase 1** (`:1598`) | n/a | **Not implemented.** No detector registered. | — |
| LG-012 | (a) build · (b) consume | (a) **Phase 1** (`:1598`) · (b) **Phase 6 — Verification** (`:1640`), per `:651`; Phase 3 (`:1626`) supplies corroboration only. §13 currently assigns the whole external half to Phase 3 at `:647` — see §9. | (b) an executed recovery journey; Resend delivery logs and Supabase auth email-template configuration corroborate | **Not implemented.** No detector registered. | (b) A journey execution touches a real mailbox and a real account: consent and ownership proof required (§8, SEC-8′), plus provider read credentials for the corroborating half. |
| LG-013 | build | **Phase 1** (`:1598`) | n/a | **Not implemented.** No detector registered. | — |
| LG-014 | (repo) build · (external) consume | (repo) **Phase 1** (`:1598`) · (external) **Phase 3** (`:1626`), already in §13 at `:647` | Sentry project event/issue listing for recent arrivals | Implemented. Emits `not_applicable` / `fail` / `pass`; the pass branch is classified `unverified`. | Sentry API credential with read scope, custody obligation, rate limits; event payloads are customer data and must be treated as untrusted and redacted. |
| LG-015 | (repo) build · (external) consume | (repo) **Phase 1** (`:1598`) · (external) **Phase 3** (`:1626`), already in §13 at `:648` | DNS resolution and TLS handshake against the canonical host; host-side domain-attachment listing | Implemented. Emits `not_applicable` / `fail` (two branches) / `pass`. **No DNS queries are performed** (§3; SEC-2). This check's applicability gate is load-bearing for the ceiling invariant (§5). | A domain probe is a network act against a host the operator must be shown to control (§8, SEC-8′); host API credential with read scope for the attachment half. |

### 3.5 The two splits, in full

**LG-003 and LG-012 are SPLITS, not reassignments.** Neither check leaves
Phase 1. In each case a repository-deterministic half stays exactly where it
is, and only the genuinely external half is allocated elsewhere. Reading
either as a reassignment would silently delete a shipped blocker.

**LG-003.** §3 defines the repository side as: given detected recurring-price
usage, a Stripe webhook route must exist and subscribe to the lifecycle events
the business logic requires, and the check "fails when no handler exists at
all." That is a repository fact, it is deterministic, and it is a blocker. Only
"whether an endpoint is actually registered at Stripe" is external, and §3
already marks that half `unverified (Phase 3)`. The provider reclassification
touches the second half only.

**LG-012.** §3 defines the blocking condition as: "Fails as a **blocker** when
no recovery flow exists at all (no `resetPasswordForEmail` usage, no reset
route/page)." That is repository-deterministic — a missing implementation is
precisely the fact repository analysis is authoritative for, and no provider
and no probe is needed to establish it. Only the second half — "when a flow
exists, its end-to-end behavior cannot be proven without email delivery" — is
external, and §3 already assigns it `unknown` with a warning-level finding and
the external-verification marker.

The failure mode to avoid: seeing "LG-012 → external" in §13 and concluding
the whole check is external. It is not. **The blocking half is and remains
repository-deterministic, Phase 1, and buildable today.**

### 3.6 Why LG-005 and LG-006 stay repository-authoritative

These are **application semantics**, and no amount of provider access
substitutes for reading the code.

You cannot determine webhook idempotency by asking Stripe whether a webhook
exists. Stripe knows it delivered an event, and it knows it delivered the same
event twice; it does not and cannot know whether your handler inserted a row
twice, sent two emails, or provisioned two seats. Likewise, you cannot
determine entitlement revocation by asking Stripe whether a subscription was
cancelled. Stripe knows the subscription ended. Whether *your* application
took access away is a fact about your code.

The same argument carries LG-007 and LG-011. A provider read would be a
category error for all four.

### 3.7 Why LG-009's primary authority *should* move to the provider (proposed — §9.1; `P1§3` and `P1§13` are not amended)

The authoritative question for tenant isolation is not "do the in-repo
migrations contain `ENABLE ROW LEVEL SECURITY`." It is "does the deployed
database enforce isolation for the role the running application actually
connects as."

Independent, pre-existing corroboration — recorded before this document and
not derived from it — is **residue R1, requirement 3**: which role the runtime
connection authenticates as **is not a repository fact**, and Supabase's
`service_role` **bypasses RLS wholesale**. A repository can declare every
policy correctly and still be fully unisolated at runtime if the connection is
made with a bypassing role. That single fact is dispositive: a repository
cannot hold the authoritative answer, so a repository-only check cannot
certify one.

This is also why A-S3 withdrew both of LG-009's deterministic branches. The
reclassification here **explains** that withdrawal; it does not undo it (§6).

## 4. FORBIDDEN IN PHASE 1 (normative)

Phase 1 performs **repository evidence only** (`specs/phase-1-repository-auditor.md`
§1.2). The security requirements SEC-1 … SEC-7
(`specs/phase-1-repository-auditor.md:511-543`) are unchanged and unrelaxed by
this document. In particular SEC-2 (no repo-directed network; the sole
permitted egress is the configured model endpoint) and SEC-3 (no credential
intake; no provider SDK clients instantiated) stand exactly as written.

§1.3 states the governing rule, and it is a *structural* rule:

> **Read-only is structural, not behavioral.** The tool must be *unable* to
> mutate external state, not merely instructed not to.

An allocation table is an instruction. It cannot and does not satisfy a
structural requirement.

### 4.1 NON-LICENCE CLAUSE

**No row in this document, and no statement in it, authorizes any
implementation change in Phase 1.** Two specific temptations are named because
they are the ones this document creates:

1. **No provider SDK client may be instantiated in any Phase-1 detector** on
   the authority of this document or any row in it. Not read-only. Not "just
   to check." Not behind a flag.
2. **No second network egress may be added to any Phase-1 detector** on the
   authority of this document or any row in it. The model endpoint remains the
   sole permitted egress; under `--offline`, zero egress (SEC-2). This
   explicitly includes DNS queries, TLS handshakes, and provider HTTP calls,
   however read-only.

Additionally: **nothing here authorizes using a live provider connector or MCP
server against a real account** — not during development, not for a
demonstration, and not to validate a row in the matrix above. A row saying
"Phase 3" describes future work that must arrive with its own packet, its own
gate, and its own structural enforcement. It does not describe present
permission.

Naming a check's authoritative source as "provider" changes **nothing** about
what the Phase-1 detector for that check may do. Today it must continue to
report the repository-side conclusion and mark the external side unverified,
exactly as §1.2 requires.

## 5. Ceiling progression, and the gate on lifting it

### 5.1 The progression

| Evidence layers held | Best reachable decision |
|---|---|
| Repository only | `ready_with_warnings` |
| Repository + provider state | Resolves the pending external verification on LG-003/010/014/015. **Rule 7 stays blocked** while LG-012's end-to-end proof (Phase 6) is outstanding and until §5.3's gate is discharged. There is no per-check `ready`: `P1§3` fixes per-check outcomes at `pass`/`fail`/`warning`/`unknown`/`not_applicable`, and `ready` is a global decision from `P1§7` Rule 7 |
| Repository + provider + customer-journey evidence | A full launch decision, including the unqualified `Ready` |

### 5.2 The honesty rule is unweakened

**The ceiling lifts by ADDING evidence layers. It never lifts by relaxing the
rule.** There is no configuration, flag, override, or accumulation of
confidence that promotes a decision above what the held evidence supports.
`specs/phase-1-repository-auditor.md` §7 says it plainly for Phase 1 — "There
is no override mechanism in Phase 1" — and this document extends the same
prohibition forward: no later phase gains an override either. A phase gains a
higher ceiling only by producing the specific external fact for the specific
check.

**A phase number is not evidence.** "We are in Phase 3" does not resolve
LG-010's DKIM question; a read of the sending domain's authentication status
does. Ceiling lifts are per-fact, not per-phase.

### 5.3 GATE (normative)

**Any change that makes §7 decision Rule 7 (`Otherwise → ready`) reachable
requires re-adjudicating every withheld certifying branch — LG-009 first —
against the six-class defeater taxonomy, BEFORE the lift ships.** The
taxonomy is recorded in `build-os/memory/residue.md` under Standing
constraints — its six classes are: (1) a sibling that overrides, (2) a later
statement that revokes, (3) a lexical context that makes it inert, (4) a
qualification mismatch that hides it, (5) a semantic equivalent
unrecognised, (6) a collection boundary that never read it. This is a
gate, not a recommendation. A lift that ships without that re-adjudication is
a defect regardless of how much new evidence it adds.

The rationale must be recorded, because it is not obvious and it will not be
rediscovered:

The **ceiling invariant** — `hasAppSignal ⊇ scanner.supported` — is what made
LG-009's pass-branch withdrawal *free*. Under that invariant a Phase-1 scan of
a supported repository always carries a pending external verification, so
Rule 6 fires and Rule 7 cannot. `pass` and `unknown` therefore produce the
**identical decision and the identical exit code**. Withholding a certifying
branch cost nothing, so the safe choice was also the cheap choice.

**The moment `ready` is reachable, that calculus dies.** `pass` and `unknown`
diverge: one clears the gate, the other does not. Every branch that was
withheld for free becomes load-bearing, and every defeater class that was
tolerable becomes a route to a false clearance. The re-adjudication must
therefore happen before the lift, not after it, and it must cover all six
classes — including class 6, *text the scan never read*, which is the class
that recurred at A-S1c, A-S2, and again within a single round at A-S3.

## 6. LG-009 non-deletion clause (normative)

**Shipped Phase-1 behaviour for LG-009 is UNCHANGED by this document.**

- **Both withheld deterministic branches STAY WITHHELD.** There is no
  `confirmed` fail and no `confirmed` pass. This document supplies a reason
  for the withdrawal; it does not supply grounds for reversing it.
- **The reclassification is ADDITIVE.** Provider evidence, when it arrives in
  Phase 3 under its own packet and its own gate, is a *new* layer placed
  alongside the shipped repository analysis. It does not replace, retire, or
  license the deletion of anything currently shipped.
- **LG-009 today emits only `not_applicable`, `unknown`, and capped
  `inferred`** — and that remains correct and remains the intended behaviour
  until a packet satisfies **all three** of residue's R1 requirements
  *conjunctively* — **(1)** a real SQL statement parser, **(2)** a default-deny
  defeater denylist, and **(3)** evidence that the connecting role is subject
  to the policies. Phase-3 provider evidence can discharge **(3) alone**; it
  does **not** discharge (1) or (2), and it is **not** by itself grounds for
  reinstating any certifying branch. Note that reinstating the `confirmed`
  *fail* branch need not make Rule 7 reachable, so §5.3's gate does **not**
  backstop this clause — this bullet is the only control on that path.
- **The existing repository-side machinery stays.** The string-aware SQL
  comment walker (which prevents a commented-out `CREATE TABLE` from
  manufacturing applicability and a commented-out `CREATE POLICY` from
  certifying isolation) and DC-11's asymmetric elision guard are load-bearing
  correctness, not scaffolding awaiting a provider. Removing either on the
  grounds that "the provider is authoritative now" would be a regression.

## 7. Open repository-side defects, with owners

**General rule, stated first because it governs both items below:
reclassifying a check's authoritative evidence source NEVER retires a defect
in its shipped repository-side implementation.** The two are independent. A
provider read that answers a *different* question does not repair a detector
that answers its own question wrongly. Both findings below were raised by
Codex review on closed work and both remain open.

### 7.1 LG-005 — the delegated-helper blind spot

**Site:** `src/checks/lg005.ts:203`.

A webhook handler that delegates its dedup guard to a helper which is
idempotent *by construction* — no event-id lookup, no upsert, no explicit
dedup marker — is excluded by the `selects` predicate, because that predicate
requires exactly those markers to be present. The helper is never surfaced.
The model therefore cannot distinguish that handler from one that inserts a
row and sends an email on every delivery, **yet the resulting verdict can
still become a blocker.**

This is **defeater class 6** — text the scan never read — and it is an
**allowlist of positives where the governing rule demands a denylist of
defeaters**. A missing positive should cost a false `unknown`; here it can
cost a false blocker instead, which is exactly the inversion the standing rule
exists to prevent.

**No provider and no probe can fix this. Only repository analysis can.**
Stripe cannot tell you what your helper function does. This is recorded as a
**named open repository-side defect** and as **the leading candidate for the
first packet after EV-001.**

### 7.2 LG-009 — unbanded elision

**Site:** `src/checks/lg009.ts:423-424` — the omission is in the sum at `:423`;
`:424` is the boolean it feeds. `prefers` at `:412-415` holds exactly **two**
predicates, so `elidedByBand` is length 3 (`src/scan/surface.ts:174`,
`bands.length + 1`) and `:423`'s `[0] + [1]` omits exactly index 2, the
trailing unbanded slot. A fix packet must re-derive this from the code.

`incompleteSurface` is computed from the first two elision bands only and
**ignores the omitted unmatched/trailing band**. The consequence is that a
model `fail` can be accepted as an inferred blocker even though the query that
would have exonerated the repository was withheld from the surface.

It is **bounded to the online path** — LG-009 has no offline verdict beyond
`not_applicable`/`unknown` — but it is **not closed**, and it is **not
resolved by the provider reclassification in §3.7.** A Supabase advisor read
answers "is RLS enabled on the deployed database"; it says nothing about
whether this detector's elision accounting is sound. The defect survives the
reclassification intact and needs its own fix.

## 8. Phase-boundary safety model — NON-NORMATIVE DESIGN SKETCH

**This section authorizes nothing.** It is a sketch of four questions that a
future provider-evidence phase will have to answer, recorded now so the
answers are not improvised under delivery pressure. Nothing here is a
requirement, a commitment, or a permission. §4's non-licence clause governs.

**SEC-3′ — credential custody.** Provider credentials would live **only in a
boundary process**, never in check code. Check code would receive
already-fetched, already-redacted provider **responses**, exactly as it
receives redacted repository excerpts today — the same shape, the same
redaction guarantee, the same inability to reach out. The existing
`RealModelClient` / `FakeModelClient` split is the reference shape: a
`FakeProviderClient` must drive every test, and no test may exercise a real
provider.

**SEC-5′ — provider responses are untrusted data too.** A provider dashboard
field or an HTTP response body is **untrusted input on exactly the same
footing as scanned repository content**. A tenant-controlled Stripe product
description, a Supabase advisor message, and probe-returned HTML are all
attacker-influenceable text. The delimited-envelope treatment, the
cite-or-discard rule, and trusted-region sanitization apply unchanged. SEC-5
does not narrow to "repository content" merely because a second source
appears.

**SEC-2′ — egress becomes an allowlist, not a relaxation.** The correct
successor to "the sole permitted egress is the model endpoint" is **a
declared, enumerated, per-phase allowlist** of permitted destinations —
**not** "many egresses," and not an unenumerated capability. The enforcement
must be **structural, not behavioural**, exactly as §1.3 demands: the process
must be *unable* to reach a destination outside its declared set, not merely
instructed not to.

**SEC-8′ — probe blast radius (proposed).** Named `SEC-8′`, not `SEC-8`: the
`SEC-N` namespace is owned by `P1§10`, and a non-normative section may not
mint into it. If `P1§10` later defines a real SEC-8, there is no collision.

A live probe acts against a running
production system, which no prior constraint in this program contemplated. At
minimum: no writes, no purchases, no account mutation, and enforced rate
limits. And, distinctly — **proof of ownership or authorization of the probe
target.** Probing a host is a network act against someone's infrastructure;
doing it without demonstrated authority is a consent and legal problem, not
merely a technical one. This is **a new constraint class for this program**,
with no analogue in SEC-1 … SEC-7, and it needs its own design rather than an
extension of an existing rule.

## 9. Divergences from §13, recorded as PROPOSED amendments (not enacted)

§13 of `specs/phase-1-repository-auditor.md` already encodes most of this
allocation, which is why this document is a refinement rather than a
replacement. Where the allocation above is finer-grained than §13, the
difference is recorded here as a **proposed amendment**. **None of these is
enacted.** §13 stands as written until a packet amends it.

1. **LG-009 is absent from the `:647` external-resolution row.** That row
   names LG-003/010/012/014/015. §3.7 argues LG-009's certifying half belongs
   with them, under Phase 3. *Proposed:* add LG-009's certifying half to the
   `:647` row. *Not enacted.*

2. **LG-009's §3 "External component" cell reads `No`.** If (1) is adopted,
   that cell and §3's LG-009 definition become inconsistent with the
   allocation. *Proposed:* reconcile both in the same amendment. *Not
   enacted.* Note that §1 of this document means the §3 cell currently wins.

3. **LG-012's external half is assigned wholly to Phase 3 at `:647`.** §3.5
   argues the end-to-end *proof* is journey execution, which `:651` assigns to
   Phase 6 (`PRODUCT_SCOPE.md:1640`); Phase 3 provides only corroboration
   (delivery logs, auth email-template configuration). *Proposed:* split the
   `:647` entry for LG-012 across Phase 3 (corroboration) and Phase 6 (proof).
   *Not enacted.*

4. **§13 does not distinguish provider reads from live probes.** `:646` and
   `:647` are provider-API reads; `:648` (DNS/TLS/domain probes) is a probe
   and is assigned Phase 3, while `:651` (customer-journey execution) is a
   probe assigned Phase 6. The two probe classes differ in blast radius and in
   the consent question (SEC-8′). *Proposed:* make the provider-read / probe
   distinction explicit in §13's owner column. *Not enacted.*

5. **LG-008's provider half is unnamed.** It is covered generically by `:646`
   but never called out, even though §3 already returns `unknown` for the
   dashboard-only mapping — a Phase-3 dependency hiding inside a Phase-1
   outcome. *Proposed:* name it. *Not enacted.*

6. **§7's Phase-1 ceiling paragraph enumerates LG-003/010/012/014/015** as the
   always-pending-external set. If (1) is adopted, that enumeration changes,
   and per §5.3 any such change must be adjudicated against the gate before it
   ships. *Proposed:* treat the §7 enumeration as amendable only inside a
   packet that also discharges the §5.3 gate. *Not enacted.*

---

## Appendix: what this document did and did not do

**Did:** allocate an authoritative evidence method to each of the 15 checks;
name the owning §35 phase for every non-Phase-1 half; record the two splits
(LG-003, LG-012) so neither is mistaken for a reassignment; restate the
Phase-1 boundary as normative with an explicit non-licence clause; record the
ceiling progression with the lift gate; freeze LG-009's shipped behaviour; and
carry the two open repository-side defects forward with owners.

**Did not:** change any check's meaning (§1); change any shipped behaviour
(§3.2, §6); authorize any provider access, SDK client, egress, connector, or
MCP server (§4.1); or amend §13 (§9).
