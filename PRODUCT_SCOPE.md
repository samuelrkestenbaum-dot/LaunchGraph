# LaunchGraph: Complete Product Scope

> This version incorporates production safety, ownership, environment separation,
> previews, rollback, cost controls, operational readiness, evaluations, support
> boundaries, provider policies, team approvals, and concierge escalation.

---

## 1. Executive summary

LaunchGraph is a paid, repository-first launch operator installed into Claude
Code, Codex, and other agentic development environments.

The user opens an application repository and delegates an outcome:

> Make this project ready to operate as a real online business.

LaunchGraph reads the codebase, determines what kind of product is being built,
identifies its existing technology and service stack, inspects connected
provider accounts, and finds everything missing between:

> The application runs.

and:

> The business works.

It then creates a dependency-aware launch plan and coordinates the work across:

* Claude Code or Codex for repository changes
* Provider APIs for deterministic configuration
* Official provider CLIs
* Infrastructure-as-code where appropriate
* The user's authenticated Chrome session
* Local testing and verification tools
* Human owners and approvers
* Authorized LaunchGraph support operators when escalation is permitted

LaunchGraph performs everything it can safely complete without interrupting the
person. It prompts the person only when it needs:

* A business decision
* Information that cannot be inferred
* Financial approval
* Production authorization
* Identity verification
* MFA or CAPTCHA
* Payment details
* Legal acceptance
* Ownership confirmation
* Resolution of material uncertainty

When the person is needed, LaunchGraph routes them to the exact provider,
account, project, environment, screen, and prepared form where their
involvement is required.

LaunchGraph does not merely recommend services or generate a checklist. It
diagnoses, routes, prepares, executes, recovers, and verifies.

The central promise is:

> Connect your repository. LaunchGraph figures out what the business needs,
> routes every task to the right place, completes the configuration, and
> verifies the entire customer journey—asking you only when human authority is
> genuinely required.

## 2. The problem

Claude Code and Codex can generate sophisticated applications quickly. However,
producing code is only one part of creating an operating online business.

AI-built applications are often left in an incomplete state:

* The application works locally.
* A preview deployment exists.
* Several SDKs are installed.
* Some environment variables are present.
* Individual screens appear functional.

But the surrounding business system remains fragmented:

* The production domain is unavailable, unowned, or incorrectly connected.
* DNS records are incomplete.
* Authentication callbacks still use localhost.
* Password-recovery and email links use development URLs.
* Stripe checkout exists without complete lifecycle handling.
* Production webhooks are absent or incorrectly secured.
* Email domains are unauthenticated.
* Analytics capture page views but not customer conversion.
* Monitoring is installed but not connected to production.
* Tenant isolation is assumed but not proven.
* Backups exist but restoration has never been tested.
* Production and staging share resources unintentionally.
* Customer support and account-deletion workflows are absent.
* Nobody has executed the complete customer journey.
* The agent says "done" because code was written, even though the external
  system was never verified.

Founders are forced to understand how domains, DNS, hosting, databases,
authentication, payments, email, analytics, monitoring, background jobs,
customer support, and legal requirements fit together.

LaunchGraph owns this missing coordination layer.

## 3. Product definition

LaunchGraph is a business-launch orchestration system.

It has four core functions.

### Diagnose

Understand the repository, inferred product, current provider configuration,
operating environment, and launch gaps.

### Route

Determine:

* Which capability is required
* Which provider should supply it
* Which account and project it belongs to
* Which environment should be changed
* Which executor should perform the action
* Whether the person must participate
* Where the person should be taken

### Execute

Coordinate:

* Repository modifications
* Provider configuration
* Browser work
* Human approvals
* Asynchronous waits
* Failure recovery
* Deployment

### Verify

Prove that:

* The configuration exists
* The application uses it
* The intended customer journey works
* Operational signals arrive
* Cancellation and failure paths behave correctly
* The business is ready for launch

LaunchGraph is not:

* A website builder
* A hosting provider
* A payment processor
* A generic coding agent
* A generic browser agent
* A static checklist
* A directory of tools
* A one-time architecture report
* An affiliate recommendation engine
* A claim of fully autonomous company creation

A concise positioning statement is:

> Claude Code builds your application. LaunchGraph launches and verifies the
> business around it.

## 4. Product form

LaunchGraph should initially be local-first and distributed through a public
GitHub repository.

The installation includes:

* LaunchGraph CLI
* Claude Code plugin
* Codex skill
* Local MCP server
* Repository scanner
* Local state manager
* Recipe engine
* Provider adapters
* Browser-control bridge
* Approval interface
* Verification runner
* LaunchGraph paid-service client

Example installation:

```
npx launchgraph install
```

Example commands:

```
/launchgraph:scan
/launchgraph:status
/launchgraph:plan
/launchgraph:prepare
/launchgraph:launch
/launchgraph:verify
/launchgraph:rollback
/launchgraph:handoff
```

The user should also be able to interact naturally:

```
Get this project ready to launch.
```

The paid LaunchGraph service supplies:

* Maintained business-capability graph
* Launch recipes
* Provider compatibility rules
* Provider-routing knowledge
* Current API and dashboard playbooks
* Configuration requirements
* Verification recipes
* Recovery procedures
* Cost and plan information
* Rule updates
* Licensing
* Optional encrypted project history
* Team and agency features
* Monitoring
* Authorized support escalation

The useful local client may be open source. The maintained intelligence,
orchestration knowledge, and continuing updates constitute the paid product.

## 5. Target customer

The initial customer is a founder, consultant, agency, or small team that has
already built or partially built a web application with an AI coding
environment.

Typical customer state:

* Has a GitHub repository
* Has a functioning local project
* May have a preview or production deployment
* Has partially installed third-party services
* Is authenticated into provider accounts in Chrome
* Understands the intended business
* Does not know every launch dependency
* Wants the project launched without personally navigating every provider and
  configuration

Initial project types:

* B2B subscription SaaS
* B2C subscription SaaS
* Paid AI applications
* Membership applications
* One-time-purchase web products
* Lead-generation applications

The first release should focus on TypeScript subscription SaaS.

## 6. Product principles

1. Read the repository before asking questions.
2. Inspect existing external state before recommending changes.
3. Infer aggressively but label uncertainty honestly.
4. Ask the person only when human involvement is necessary.
5. Ask once and reuse the answer.
6. Prepare consequential actions before requesting approval.
7. Route people to exact interfaces, not generic documentation.
8. Prefer APIs, CLIs, and infrastructure-as-code over browser automation.
9. Use authenticated Chrome as a broad fallback.
10. Separate recommendation, preparation, approval, execution, and verification.
11. Separate test, preview, staging, and production.
12. Never confuse code with a functioning capability.
13. Never claim completion without evidence.
14. Preserve customer ownership of every critical account and asset.
15. Prefer completing a coherent existing stack over replacing it.
16. Preview material changes before applying them.
17. Capture prior state before mutable changes.
18. Make interrupted workflows resumable.
19. Make consequential actions auditable.
20. Treat repositories and browser content as untrusted input.
21. Never optimize recommendations around undisclosed affiliate revenue.
22. Keep the person responsible for money, identity, ownership, legal
    acceptance, and final launch.
23. Keep LaunchGraph responsible for everything else it can safely perform.

## 7. Primary user experience

### 7.1 Repository-first analysis

LaunchGraph begins by reading the repository.

It detects:

* Framework
* Runtime
* Frontend and backend
* Database
* Authentication
* Payments
* Email
* Hosting
* Domain assumptions
* Storage
* Analytics
* Monitoring
* Queues and background jobs
* External APIs
* Environment variables
* Deployment configuration
* Database migrations
* Tests
* Security controls
* Customer-facing policies
* Support workflows

Initial response:

```
I'm analyzing the repository and its existing services.

Detected:
Next.js, Vercel, Supabase, Stripe, Resend, PostHog and Sentry.

This appears to be a multi-tenant subscription SaaS.

I'm checking:
- what exists in code
- which external resources exist
- which environment each resource belongs to
- what is incomplete
- what requires a business decision
- what must be verified

I'll interrupt you only when I need information, approval,
identity confirmation, legal acceptance, or a decision that
cannot be inferred safely.
```

### 7.2 Product inference

LaunchGraph produces an evidence-backed interpretation:

```
Inferred product:
B2B subscription SaaS

Customer structure:
Users belong to organizations.

Likely billing:
Organizations pay a recurring monthly subscription.

Likely journey:
Visit site
→ create account
→ create organization
→ begin trial
→ subscribe
→ receive paid access

Confidence:
92%
```

Every conclusion is classified as:

* Confirmed
* Inferred
* Unverified
* Contradictory
* Requires confirmation

Consequential findings must include repository evidence.

### 7.3 Existing-production classification

Before modifying anything, LaunchGraph classifies the project:

```
Greenfield
Local only
Preview
Pre-launch production
Live without known customers
Live with customers
Unknown
```

Signals include:

* Production deployment activity
* Public DNS
* Database records
* Stripe customers and payments
* Analytics traffic
* Recent webhooks
* Email delivery
* Existing production secrets
* GitHub deployment environments

If the project is live or status is unknown, LaunchGraph applies a more
restrictive policy:

* Read-only inspection first
* Explicit change preview
* Smaller approvals
* Required rollback plan
* No destructive actions
* No silent production changes
* Maintenance-window guidance when appropriate

### 7.4 Service-state inspection

LaunchGraph distinguishes:

```
SDK detected
Account connected
Resource exists
Application connected
Production configuration complete
Capability verified
```

Example:

```
Stripe SDK detected                         ✓
Checkout endpoint detected                  ✓
Stripe account connected                    ✓
Live-mode status known                      ✓
Production webhook configured               ✗
Cancellation behavior implemented           ✗
Payment-to-access journey verified          ✗
```

### 7.5 Minimal clarification

LaunchGraph asks only material questions not answerable from available
evidence.

Examples:

* Which domain should be used?
* Should users or organizations pay?
* Is there a free trial?
* Which legal entity owns the business?
* What geography will be served?
* What infrastructure budget should be respected?
* Is the current deployment already customer-facing?
* Which person owns financial approvals?

Answers become reusable project facts.

## 8. Routing engine

Routing is a primary product capability.

### 8.1 Capability routing

LaunchGraph determines which provider should handle each requirement.

Example:

```
Requirement:
Purchase and manage production domain.

Existing context:
Vercel deployment
Supabase authentication
Cloudflare account detected

Recommended:
Cloudflare Registrar

Reason:
Existing account, integrated DNS, predictable pricing, and direct
compatibility with the selected deployment.
```

### 8.2 Executor routing

Each action is assigned to:

* Claude Code
* Codex
* Provider API
* Official provider CLI
* Infrastructure-as-code
* Authenticated Chrome
* Human owner
* Verification runner
* Authorized support operator

Example:

```
Repair Stripe lifecycle code       → Claude Code
Create production webhook          → Stripe API
Complete identity verification     → Human through Chrome
Verify signed webhook              → Verification runner
```

### 8.3 Account and project routing

LaunchGraph identifies:

* Provider
* Organization
* Account
* Project
* Region
* Environment
* Billing owner

It must stop when account identity is ambiguous.

### 8.4 Interface routing

When a person is needed, LaunchGraph should:

1. Open the correct provider.
2. Verify the provider domain.
3. Confirm the active account.
4. Select the correct project.
5. Select test or production.
6. Navigate to the exact screen.
7. Fill known values.
8. Explain the remaining human action.
9. Wait for completion.
10. Verify the result.
11. Resume automatically.

### 8.5 "Take me there"

Every human-dependent action should offer:

```
Take me to this step
```

Examples:

* Review domain purchase
* Enter payment card
* Complete MFA
* Verify Stripe business identity
* Accept Google OAuth terms
* Approve production deployment
* Review legal drafts
* Confirm account ownership

## 9. Exception-driven collaboration

Every action belongs to one interaction class.

### 9.1 Autonomous

Allowed when the action is:

* In scope
* Reversible
* Low risk
* Free
* Non-destructive
* Not an external communication
* Not a production mutation

Examples:

* Read repository
* Inspect external state
* Run tests
* Check DNS
* Prepare configuration
* Create local branch
* Draft pull request
* Fill unsubmitted form
* Collect evidence

### 9.2 Information request

Ask only when information cannot be inferred or retrieved.

Explain:

* Why it is needed
* Where it will be used
* Whether it will be stored
* Whether it will be shared externally

### 9.3 Prepared approval

Before interruption, LaunchGraph prepares everything possible.

```
Ready for approval

Action:
Purchase getbriefly.com through Cloudflare Registrar

Environment:
Production

Owner:
Briefly, Inc.

Prepared:
✓ Availability confirmed
✓ Registrant details entered
✓ Vercel project identified
✓ DNS change prepared
✓ Renewal terms checked

Cost:
$11.20 today
Approximately $11.20/year
Auto-renewal enabled

Reversibility:
The purchase cannot be reversed automatically.

Nothing has been submitted.

Approve and continue?
```

### 9.4 Temporary human handoff

Required for:

* MFA
* CAPTCHA
* Identity verification
* Payment-card entry
* Bank details
* Terms acceptance
* Legal attestation
* Security challenges

The system routes the person to the prepared step and resumes afterward.

## 10. Approval and team authority

LaunchGraph must support multiple roles.

Possible roles:

* Project owner
* Developer
* Production operator
* Finance approver
* Security approver
* Legal approver
* Agency operator
* Client owner
* Read-only reviewer

Example authority:

```
Developer:
May approve repository pull requests.

Finance:
May approve new subscriptions and purchases.

Client owner:
Must approve domain ownership and production launch.

Agency:
May prepare actions but cannot purchase or accept terms.
```

Mandatory approval categories:

* Purchases
* Paid subscriptions
* Production writes
* DNS mutations
* Live-payment activation
* Database migrations
* External email
* Default-branch merges
* Ownership changes
* Legal acceptance
* Destructive actions
* Changes affecting existing customers

Approvals should be narrow but not excessively fragmented.

## 11. Launch recipes

LaunchGraph should initially use curated recipes rather than attempting
universal execution.

A recipe defines:

* Business pattern
* Required capabilities
* Preferred stack
* Supported alternatives
* Detection rules
* Dependencies
* Configuration actions
* Executor routing
* Browser destinations
* Human checkpoints
* Cost model
* Verification journeys
* Recovery playbooks
* Support level

Initial recipe:

```
Subscription SaaS

GitHub
Next.js
Vercel
Supabase
Stripe
Resend
Cloudflare
PostHog
Sentry
```

Later recipes:

* Consultancy
* Lead-generation business
* Paid content
* Membership business
* One-time purchase
* Marketplace
* Ecommerce

The architecture may be general while actual support remains explicit.

## 12. Support levels

Every capability and provider action must have a support classification.

**Fully supported** —
Tested inspection, execution, recovery, and verification.

**Guided** —
LaunchGraph can diagnose and route the person but does not guarantee
execution.

**Experimental** —
Available with prominent warnings and smaller permissions.

**Unsupported** —
LaunchGraph explains the requirement but will not improvise production
changes.

Example:

```
Vercel domain connection       Fully supported
Netlify domain connection      Guided
Fly.io custom domain           Experimental
Custom Kubernetes ingress      Unsupported
```

The agent must never treat plausible instructions as equivalent to tested
support.

## 13. Provider adapters

Each provider implements:

```
inspect()
recommend()
route()
preview()
prepare()
requestApproval()
execute()
verify()
recover()
rollback()
handoff()
```

Preferred execution order:

```
1. Provider API
2. Official CLI
3. Infrastructure-as-code
4. Authenticated Chrome
5. Exact human guidance
```

Browser automation is the broad fallback, not the foundation for every action.

## 14. Provider automation policies

Every provider adapter should declare what LaunchGraph may do through:

* API
* CLI
* Browser
* Human-only steps

The policy should account for:

* Provider terms
* Automation restrictions
* Account-creation restrictions
* Credential-sharing rules
* Browser-automation limitations
* Rate limits
* Regional requirements
* Reselling restrictions

LaunchGraph must not:

* Bypass CAPTCHA
* Bypass MFA
* Circumvent identity checks
* Accept legal terms for the user
* Evade provider restrictions
* Misrepresent account ownership

When automation is prohibited or uncertain, LaunchGraph should route the user
to the exact step.

## 15. Repository analysis

LaunchGraph combines:

### Deterministic detection

Inspect:

* Package manifests
* Lockfiles
* Imports
* Environment variables
* Framework configuration
* Deployment files
* Database schema
* API routes
* Authentication
* Payments
* Webhooks
* Email
* Analytics
* Monitoring
* Jobs
* Tests
* Policies

### Structured AI interpretation

Ask bounded questions:

* What behavior is implemented?
* Who appears to pay?
* How is access granted?
* How is cancellation handled?
* Which code is active?
* What appears abandoned?
* What conclusions are uncertain?

Require evidence.

### Human confirmation

Request confirmation only for consequential unresolved ambiguity.

## 16. Business-capability graph

The capability graph maps repository and provider evidence to operating
requirements.

Examples:

```
Recurring Stripe price
→ billing lifecycle
→ signed webhook
→ idempotency
→ failed-payment behavior
→ cancellation behavior
→ entitlement verification

OAuth
→ production domain
→ callback configuration
→ consent configuration
→ privacy policy

File upload
→ storage
→ authorization
→ file limits
→ retention
→ deletion

Organization tables
→ tenant isolation
→ invitation flow
→ role enforcement
→ organization billing
```

The graph should contain:

* Requirements
* Prerequisites
* Compatible providers
* Common failures
* Setup procedures
* Cost factors
* Verification recipes
* Recovery procedures
* Operational ownership

This is a central commercial asset and must be versioned and tested.

## 17. Operational readiness

LaunchGraph should inspect more than technical infrastructure.

Capabilities may include:

* Support email
* Contact mechanism
* Administrative customer view
* Account deletion
* Data export
* Refund process
* Subscription cancellation
* Failed-payment recovery
* Incident contact
* Alert ownership
* Customer-status communication
* Basic internal runbooks
* Provider-account recovery
* Ownership of renewals

These requirements may be marked:

* Required before launch
* Recommended before launch
* Post-launch improvement
* Not applicable

LaunchGraph should not present legal conclusions. It may identify operational
gaps and provide reviewable drafts or routes to appropriate professionals.

## 18. Environment separation

LaunchGraph must model:

* Local
* Test
* Preview
* Staging
* Production

Every resource and action must be associated with an environment.

The product must detect and prevent:

* Production database use in previews
* Stripe test keys in production
* Live keys in development
* Staging callbacks replacing production callbacks
* Test email reaching customers
* Production analytics polluted by development
* Production webhooks targeting preview deployments

Every consequential approval must display the environment prominently.

## 19. Change preview

Before material changes, LaunchGraph generates a preview.

Example:

```
Planned DNS changes

Environment:
Production

Add:
+ CNAME www → cname.vercel-dns.com
+ TXT resend._domainkey → ...

Replace:
~ A @
  Previous: 192.0.2.10
  New: Vercel-managed target

Possible impact:
The current root-domain website may become unavailable during
propagation.

Rollback:
Restore A @ → 192.0.2.10
```

The preview should include:

* Current state
* Proposed state
* Cost
* Impact
* Dependencies
* Downtime risk
* Reversibility
* Rollback
* Verification

The lifecycle should be:

```
Inspect → Plan → Preview → Approve → Apply → Verify
```

## 20. Rollback

Before changing mutable external state, LaunchGraph captures the prior state.

Examples:

* DNS records
* Environment variables
* OAuth callbacks
* Webhooks
* Deployment aliases
* Provider settings
* Database schema version
* Email-domain configuration

Supported operations should offer:

```
Undo last change
Restore pre-launch state
Roll back deployment
Restore previous DNS
```

Irreversible actions must be labeled:

* Domain purchase
* Sent external email
* Accepted terms
* Certain provider charges
* Permanent data deletion

LaunchGraph must never imply that an irreversible action can be automatically
undone.

## 21. Workflow state and recovery

Each action uses:

```
Planned
Prepared
Awaiting information
Awaiting approval
Awaiting human step
Executing
Externally pending
Completed but unverified
Verified
Failed
Blocked
Rolled back
```

The workflow must survive:

* Terminal closure
* Agent restart
* Browser interruption
* MFA pause
* DNS propagation
* Provider outage
* Deployment failure
* Network loss
* Human delay

Before retries, LaunchGraph inspects external reality.

It must never blindly repeat:

* Purchases
* Subscription creation
* Webhook creation
* DNS replacement
* Migrations
* External email
* Production writes

## 22. Cost governance

LaunchGraph should calculate:

* Immediate cost
* Monthly baseline
* Usage-based exposure
* Free-tier limits
* Trial expiration
* Renewal dates
* Automatic upgrades
* Duplicate services
* Unused paid services
* Potential overage

Example:

```
Expected baseline:
$64/month

Usage-based exposure:
$0–350/month at projected volume

Trials ending:
Resend Pro trial in 11 days

Possible duplication:
PostHog and Google Analytics both capture product events.
```

Before approving a stack:

* Show expected cost
* Explain major assumptions
* Show alternatives
* Identify switching costs
* Respect a user-defined budget

Any affiliate relationship affecting recommendations must be disclosed.

## 23. Account ownership and handoff

Critical infrastructure must be owned by the customer or designated legal
entity.

LaunchGraph should not create customer assets under a LaunchGraph-controlled
master account.

Track:

```
Service
Legal owner
Primary administrator
Billing owner
Technical owner
Recovery email
MFA status
Renewal date
Handoff status
```

Example:

```
Service      Owner          Billing       Technical     Recovery
Cloudflare   Briefly, Inc.  Founder       CTO           ops@briefly.com
Stripe       Briefly, Inc.  Finance       CTO           finance@briefly.com
```

Agency workflows should include a formal client handoff:

* Transfer ownership
* Confirm client access
* Remove unnecessary agency access
* Verify billing ownership
* Deliver recovery information
* Record acceptance

## 24. Chrome collaboration

The Chrome bridge should:

* Detect authenticated providers
* Verify active account
* Select project and environment
* Navigate to exact setting
* Fill known values
* Pause before consequential actions
* Hand off MFA, payment, identity, and terms
* Detect completion
* Capture confirmation
* Verify externally

Required safeguards:

* Confirm provider domain
* Confirm account
* Confirm project
* Confirm environment
* Never type secrets into an unverified site
* Never bypass security controls
* Never accept terms
* Stop if the UI materially differs
* Capture evidence
* Verify through another channel when possible

## 25. Claude Code and Codex work packages

Every coding task should include:

* Finding
* Evidence
* Authorized scope
* Requirements
* Prohibited actions
* Tests
* Acceptance criteria
* Verification procedure

Example:

```
Task:
Implement subscription cancellation.

Evidence:
No handler exists for customer.subscription.deleted.

Requirements:
- Verify signature
- Handle duplicates idempotently
- Update organization entitlement
- Record cancellation
- Add tests

Do not:
- Change live Stripe configuration
- Create production webhooks
- Deploy to production

Completion:
Open a pull request and return test evidence.
```

Repository completion is separate from external verification.

## 26. Secrets and security

LaunchGraph should minimize central credential custody.

Preferred credential order:

1. Provider OAuth
2. Official CLI session
3. Short-lived token
4. User-managed vault
5. Encrypted credential reference

Secrets must never:

* Appear in prompts
* Be returned through MCP
* Be logged
* Be committed
* Be exposed to unnecessary agents
* Be stored unencrypted

Repositories and browser pages are untrusted input.

Required controls:

* Least privilege
* Tenant isolation
* Prompt-injection defense
* No automatic execution of arbitrary repository scripts
* Repository sandboxing
* Secret scanning
* Short-lived execution credentials
* Append-only audit trail
* Connection revocation
* Project export and deletion
* Rate limiting
* Production/test separation
* Human authority enforcement

## 27. Verification

Completion is defined by evidence.

### Domain

* Ownership confirmed
* DNS resolves
* TLS valid
* Canonical redirects correct

### Deployment

* Production deployment succeeded
* Health check passes
* Correct production resources are used

### Authentication

* Signup works
* Verification email arrives
* Verification link works
* Login/logout work
* Recovery works
* Protected routes enforce access

### Payments

* Checkout works
* Webhook arrives
* Signature is valid
* Duplicate delivery is safe
* Entitlement activates
* Failed payment follows policy
* Cancellation removes or schedules removal of access

### Email

* Sending domain authenticated
* Transactional email arrives
* Production links correct
* Sensitive data excluded

### Analytics

* Signup event arrives
* Checkout event arrives
* Purchase event arrives
* Environments separated

### Monitoring

* Test error arrives
* Environment identified
* Release identified
* Sensitive data redacted

## 28. Canonical journey

The first supported journey:

```
Visit production domain
→ create account
→ receive verification email
→ verify
→ log in
→ begin checkout
→ complete test payment
→ receive entitlement
→ record purchase
→ generate controlled error
→ cancel subscription
→ process cancellation
→ update entitlement
```

The final report includes:

* Pass/fail
* Timestamps
* Screenshots
* DNS evidence
* Deployment evidence
* Email evidence
* Webhook evidence
* Application-state evidence
* Analytics evidence
* Monitoring evidence
* Warnings
* Overrides

Launch decision:

```
Ready
Ready with warnings
Not ready
```

## 29. Post-launch monitoring and incidents

LaunchGraph should monitor:

* Domain and certificate health
* Deployment availability
* Webhook failures
* Email-domain health
* OAuth expiration
* Database capacity
* Provider connection failures
* Configuration drift
* New repository requirements
* Unused services
* Trial and renewal dates

Incident flow:

1. Detect.
2. Classify severity.
3. Identify affected journeys.
4. Attempt only preauthorized recovery.
5. Route owner to intervention if needed.
6. Verify recovery.
7. Record incident.
8. Update playbook when appropriate.

LaunchGraph must avoid noisy alerts. Only material conditions should interrupt
the owner.

## 30. Evaluation framework

LaunchGraph needs reference repositories with known conditions:

* Correct implementation
* Missing webhook
* Insecure webhook
* Missing tenant isolation
* Localhost callbacks
* Unused SDK
* Multiple payment providers
* Intentionally disabled feature
* Mixed environments
* Existing live customers
* Unauthenticated email
* Duplicate analytics
* Broken cancellation

Measure:

* Stack-detection accuracy
* Business-model inference
* Launch-blocker precision
* Launch-blocker recall
* False-positive rate
* Correct executor routing
* Correct account/environment routing
* Browser completion rate
* Verification accuracy
* Recovery success
* Human interruptions per launch
* Time to first useful finding
* Time to verified journey

A central metric should be:

> Percentage of connected projects that reach a verified customer journey.

## 31. Concierge escalation

The paid beta should include an internal operator console.

With explicit customer permission, an authorized LaunchGraph operator may
assist when:

* Automation reaches an unsupported state
* Provider UI changes
* Repository inference is materially uncertain
* Recovery requires expert judgment
* A launch is blocked by an unknown provider condition

The console should provide:

* Blocked workflow
* Sanitized evidence
* Support classification
* Customer communication
* Manual resolution record
* Playbook-update workflow

Operators should not receive secret access by default.

Early concierge support allows the product to learn without pretending
universal automation already exists.

## 32. Compatibility and fallbacks

LaunchGraph should account for:

* Chrome unavailable
* Different Chrome profile
* Safari or Firefox
* Claude Code unavailable
* Codex unavailable
* Missing provider CLI
* Docker unavailable
* Windows
* Linux
* Remote SSH
* Codespaces
* Corporate-device restrictions

Fallback hierarchy:

```
API
→ CLI
→ infrastructure-as-code
→ Chrome
→ exact human instructions
→ authorized support escalation
```

The workflow should remain useful even when full browser control is
unavailable.

## 33. Commercial model

### Free scan

* Public repository
* Basic stack detection
* Limited findings
* Basic report

### Launch audit

* Private repository
* Product inference
* Capability map
* Production classification
* Launch blockers
* Stack recommendation
* Cost estimate
* Launch plan
* One-time fee

### Launch agent

* Claude/Codex integration
* Full recipes
* Provider inspection
* Browser routing
* Approvals
* Controlled execution
* Rollback
* Verification
* Persistent state
* Monitoring
* Monthly subscription

### Agency

* Multiple clients
* Role-based approvals
* Reusable policies
* Ownership handoff
* White-labeled reports
* Portfolio monitoring
* Client billing separation

Pricing should be based on projects and verified outcomes rather than token
consumption.

## 34. Initial golden path

The first fully supported configuration:

```
GitHub
Next.js
Vercel
Supabase
Stripe
Resend
Cloudflare
PostHog
Sentry
Claude Code or Codex
Authenticated Chrome
```

Other providers may be detected or guided but should not be presented as fully
supported until inspection, execution, recovery, and verification are tested.

## 35. Implementation phases

### Phase 1: Repository auditor

Build:

* CLI
* Local MCP
* Repository scanner
* Stack detection
* Product inference
* Production classification
* Capability graph
* Findings
* Recipe selection
* Cost estimate
* Launch plan

### Phase 2: Agent coordinator

Build:

* Claude plugin
* Codex skill
* Work packages
* Local state
* Pull-request workflow
* Evidence submission
* Rescanning

### Phase 3: Provider inspector and router

Build read-only connections and exact routing for the golden-path providers.

### Phase 4: Chrome collaboration

Build account verification, page routing, form preparation, human handoff,
confirmation capture, and resume behavior.

### Phase 5: Preview, approvals, and execution

Build change previews, team authority, write operations, state capture,
rollback, and audit logs.

### Phase 6: Verification

Build the complete subscription journey and launch decision.

### Phase 7: Monitoring and incidents

Build drift, renewals, webhook health, alerting, and recovery.

### Phase 8: Additional recipes and adapters

Expand deliberately through tested capability packs.

## 36. MVP acceptance test

Using a deliberately incomplete SaaS repository, LaunchGraph must:

1. Detect the architecture.
2. Infer the business model.
3. Classify production status.
4. Detect existing providers.
5. Detect localhost callbacks.
6. Detect incomplete payment lifecycle.
7. Detect missing production webhook.
8. Detect unauthenticated email.
9. Detect missing conversion analytics.
10. Identify environment mixing.
11. Ask only necessary questions.
12. Recommend the supported recipe.
13. Estimate cost.
14. Generate an ordered plan.
15. Route coding work to Claude/Codex.
16. Open a pull request.
17. Preview provider changes.
18. Route the person to exact human steps.
19. Request granular approvals.
20. Avoid duplicate actions.
21. Capture previous state.
22. Configure supported providers.
23. Deploy.
24. Execute the customer journey.
25. Collect evidence.
26. Produce a launch decision.
27. Generate ownership and handoff records.
28. Recover successfully from at least one injected interruption.

## 37. Final product definition

LaunchGraph is a local-first, paid launch operator installed into Claude Code
and Codex.

It reads the repository, infers the business, understands existing external
state, selects a supported launch recipe, identifies missing capabilities, and
routes every action to the correct provider, account, project, environment,
executor, and approver.

It prepares routine configuration, gives bounded code changes to coding
agents, uses APIs and CLIs where possible, controls authenticated Chrome when
necessary, and takes the person directly to irreducible human steps.

It protects ownership, previews risk, enforces environment boundaries, tracks
costs, captures rollback state, survives interruptions, verifies real customer
outcomes, and continues monitoring after launch.

The user does not receive another checklist.

The user delegates the outcome:

> Make this repository into a working online business.

LaunchGraph handles everything it safely can and asks the person only when the
person is genuinely required.

---

# Part II: Product strategy — the narrowed first product

The complete scope in Part I is the destination, not the entry point. The
long-term product remains the launch operator. But the first sellable product
should be the production-readiness and launch-verification layer for AI-built
SaaS—not the full autonomous launcher.

## What changes

The original vision becomes the destination:

```
Repository
→ diagnosis
→ remediation
→ provider configuration
→ approvals
→ launch
→ continuous operation
```

The first product covers:

```
Repository + read-only provider access
→ evidence-backed diagnosis
→ agent-ready remediation plan
→ verified customer journey
```

External execution can initially be performed through:

* The customer's Claude Code or Codex
* Exact provider instructions
* "Take me there" browser routing
* Concierge assistance from LaunchGraph
* Limited automation for stable, low-risk actions

This allows the customer to receive the outcome before every step is
productized.

## Revised first product

**LaunchGraph Production Readiness**

A customer connects a Next.js SaaS repository and optionally grants read-only
access to Vercel, Supabase, Stripe, Resend, PostHog and Sentry.

LaunchGraph returns:

1. What the application appears to be
2. Which services it uses
3. Whether test and production are separated
4. Which launch capabilities are incomplete
5. Repository and provider evidence
6. Severity and confidence
7. Remediation packages for Claude Code or Codex
8. Exact external configuration steps
9. Estimated recurring costs
10. A verified launch decision

The central output is not a generic report. It is an evidence package:

```
NOT READY

3 launch blockers
5 warnings
2 unverified capabilities

BLOCKER: Stripe cancellation does not remove access

Evidence:
src/app/api/stripe/webhook/route.ts
No customer.subscription.deleted handler exists.

External evidence:
No active production webhook subscribes to
customer.subscription.deleted.

Remediation:
Claude Code work package generated.

Verification:
Create test subscription
→ cancel it
→ deliver webhook
→ confirm entitlement removal
```

## Initial checks

The first version should reliably detect approximately 15 conditions:

1. Production callbacks using localhost
2. Stripe test/live key mixing
3. Missing production webhook
4. Missing webhook signature verification
5. Non-idempotent webhook processing
6. Missing cancellation handling
7. Payment not connected to entitlement
8. Preview deployment using production database
9. Missing tenant-isolation evidence
10. Unauthenticated email domain
11. Production email links using the wrong hostname
12. Password recovery unverified
13. Missing signup or purchase conversion event
14. Sentry installed but unverified in production
15. Missing or unverified production domain

Accuracy on these checks is more valuable than shallow coverage of 100
providers.

## The initial customer workflow

```
Agency connects client repository
        ↓
LaunchGraph scans repository
        ↓
Read-only provider checks
        ↓
Readiness report generated
        ↓
Claude/Codex remediation packages created
        ↓
Agency or LaunchGraph concierge completes external configuration
        ↓
LaunchGraph runs canonical customer journey
        ↓
Ready / Ready with warnings / Not ready
        ↓
White-labeled handoff report delivered to client
```

That is already a complete commercial product.

## Best initial customer

Agencies and repeat builders are a better initial customer than hobbyists.

An agency has:

* Multiple launches
* A repeatable stack
* Higher willingness to pay
* A reputation to protect
* A need for client handoff
* Existing Claude/Codex usage
* A reason to standardize production readiness

The initial pitch becomes:

> Every AI-built application your agency ships receives the same
> evidence-backed production audit, remediation plan, customer-journey test
> and client handoff report.

This is easier to sell than "trust our new agent to control your production
accounts."

## What not to build initially

Defer:

* Universal provider adapters
* Direct production mutations
* A large workflow engine
* Team-wide approval infrastructure
* Automated purchases
* Incident management
* Full cost optimization
* Continuous production operation
* Every business model
* Every programming language
* Proprietary hosted browser infrastructure

Preserve these concepts in the architecture, but do not make them
prerequisites for revenue.

## What should remain from the larger scope

Keep these foundational pieces:

* Evidence-backed findings
* Capability graph
* Support classifications
* Environment separation
* Repository-first inference
* Verification as completion
* Claude/Codex work packages
* Provider-independent data model
* Exact "take me there" routing
* Ownership and handoff reporting
* Readiness decisions with confidence boundaries

These become the foundation from which automation grows.

## How the company evolves

Product 1: Audit

```
Find what prevents launch.
```

Product 2: Remediation

```
Give Claude/Codex bounded fixes and verify them.
```

Product 3: Guided launch

```
Route the person to external steps and provide concierge execution.
```

Product 4: Orchestrated launch

```
Execute stable provider actions after approval.
```

Product 5: Launch operating system

```
Monitor, recover and govern the business after launch.
```

Every stage is separately useful and sellable.

## Strategic direction

Adopt the narrowed audit-first wedge, but retain LaunchGraph as the broader
brand and architecture.

The immediate product definition should be:

> LaunchGraph is the production-readiness and launch-verification layer for
> AI-built SaaS applications. It reads the repository and connected provider
> state, identifies consequential launch gaps, creates remediation packages
> for Claude Code and Codex, and verifies the complete customer journey.

The first milestone should be one deliberately incomplete reference SaaS where
LaunchGraph detects the 15 known conditions, produces an excellent report,
generates agent-ready fixes, and validates the corrected customer journey.

Once that works, run it on real agency projects with concierge support. Those
launches will reveal which parts deserve automation far more accurately than
attempting to predict the entire platform now.
