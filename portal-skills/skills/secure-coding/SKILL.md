---
name: secure-coding
description: Apply a baseline of secure-coding standards to code being written or reviewed. Covers auth, secrets management, input validation, injection prevention, password hashing, PII handling, dependency hygiene, rate limiting, CORS, security headers, HTTPS, error/logging discipline, and infra hardening. Use proactively whenever the user writes or edits authentication/authorization logic, login/session/token code, API endpoints, database queries, file uploads or external input handling, credential storage, secret/config loading, CORS or header configuration, error handlers, logging, or any Dockerfile/k8s/IAM config. Also trigger on explicit asks like "security review", "is this safe", "audit this", "check for vulnerabilities", or mentions of OWASP, injection, XSS, CSRF, or SSRF. Even if the user doesn't ask for a security check, flag clear violations in code they're touching.
---

# Secure Coding Baseline

These are baseline security requirements for any team. Apply them whenever writing, modifying, or reviewing security-sensitive code.

The point of each rule is in the *why*: when you hit an edge case the checklist doesn't cover, reason from the principle, not the literal rule.

## How to apply

- **Writing new code in a security-relevant area**: follow these rules by default. Don't ask the user for permission to be secure.
- **Editing existing code**: if you notice a violation in code you're touching (even unrelated to the current task), flag it once with the rule it breaks and propose the fix. Do not lecture, do not list every minor issue. Surface what matters.
- **Explicit "security review" requests**: walk the relevant sections systematically and report issues grouped by category.
- **Uncertain whether something counts**: name the rule and the situation and let the user decide.

Phrase findings like a peer pointing something out, not a compliance bot:

> "Heads up: this concatenates `req.body.email` into the SQL string, which is the injection pattern we don't allow. Want me to switch to a parameterized query?"

One line, name the rule, propose the fix.

## Authentication & Authorization

- **Use an authentication mechanism appropriate to the project.** OIDC for user-facing apps; mutual TLS or signed tokens for service-to-service. *Why: each context has known-good patterns; picking the wrong one usually means rolling something custom.*
- **Use a well-known, maintained auth library. Never roll your own.** *Why: cryptographic and protocol mistakes are subtle and the cost of getting them wrong is account takeover.*
- **Enforce authorization at the server, not just the UI.** A hidden button is not a permission check. *Why: clients are untrusted; UI-only enforcement is bypassed by anyone reading the network tab.*
- **Least privilege.** Tokens and roles grant the minimum access needed for the task.
- **Short-lived tokens with refresh rotation** over long-lived sessions. *Why: limits blast radius if a token leaks.*

## Secrets Management

- **Never commit secrets to version control**: not in source files, not in config files. *Why: git history is forever; even deleted commits live on in clones, forks, and CI logs.*
- **Use environment variables or a secrets manager.** Read at runtime, not at build time when possible.
- **Different secrets per environment.** Dev, staging, and prod must not share keys. *Why: a dev leak should not compromise prod.*
- **Rotate on suspected exposure.** Set up alerts for accidental commits (pre-commit hooks, secret scanning).

## Input & Output

- **Validate and sanitize all input at the boundary**: type, length, format, range. *Why: validation at the edge lets everything downstream trust its inputs.*
- **Use parameterized queries or an ORM. Never interpolate user input into SQL.** *Why: SQL injection remains one of the highest-impact web vulnerabilities; it is fully prevented by parameterization.*
- **Escape output based on context.** HTML, JSON, shell, log lines: each has its own rules. *Why: a value safe in JSON can be an XSS payload in HTML or a shell-injection vector in a command.*
- **Generic error messages to clients; full detail server-side.** *Why: error responses leak stack traces, schema, file paths, and library versions that attackers use to probe.*

## Data Protection

- **Hash passwords with a slow algorithm: bcrypt or Argon2.** Never MD5, SHA1, or plain storage. *Why: fast hashes get brute-forced on commodity hardware; slow ones don't.*
- **Do not log or persist PII, credentials, or tokens on the client.** *Why: client storage is inspectable; logs end up in places (error trackers, log aggregators, screenshots) you didn't plan for.*
- **Data minimization.** Only store what you actually need. *Why: data you don't have can't be breached.*

## Dependencies

- **Audit dependencies regularly** for known vulnerabilities: `npm audit`, `pip audit`, Dependabot, whatever fits the stack.
- **Avoid abandoned or unvetted packages for anything security-adjacent.** *Why: unmaintained auth/crypto libraries don't get patched when CVEs land.*

## API Design

- **Rate-limit all public-facing endpoints**, especially unauthenticated ones. *Why: without rate limits, free endpoints become DoS vectors and credential-stuffing targets.*
- **Expose only what is needed.** No internal fields in responses, no debug endpoints, no admin routes in production.
- **HTTPS everywhere; redirect HTTP to HTTPS.** No exceptions for "internal" traffic that crosses a network boundary.

## Infrastructure & Configuration

- **Disable debug mode and verbose error output in production.** Stack traces in responses are a leak.
- **Restrict CORS to known origins.** Never `*` for authenticated APIs. *Why: wildcard CORS combined with credentials lets any site act as the user.*
- **Apply security headers:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- **Run services as least-privileged system users.** Never as root in containers or on hosts.

## Code & Architecture

- **Security-sensitive logic (auth, payments, access control) goes through a second person's code review.** *Why: a single set of eyes misses things; the cost of a security bug is much higher than the cost of one extra reviewer.*
- **Keep security logic centralized.** *Why: scattered ad-hoc checks lead to gaps; one missed call site is a vulnerability.*

## Monitoring & Incident Response

- **Log authentication events, permission failures, and unusual access patterns.** *Why: you cannot respond to an incident you cannot see; these logs are also what auditors and post-mortems rely on.*

## Edge cases and judgment calls

When the checklist doesn't speak directly to the situation:

- **Internal-only service?** "Internal" is not a permission model. Assume the network is hostile and apply auth/HTTPS anyway.
- **Throwaway prototype?** If it touches real user data or real credentials, the rules apply. If it's a local script with mock data, use judgment.
- **Performance vs. security tradeoff?** Default to secure; flag the tradeoff to the user with the numbers, don't silently weaken.
- **Existing code already violates a rule and the user's task is unrelated?** Mention it once, don't refuse the task, don't sprawl into a cleanup unless asked.
