---
name: principles-first
description: Apply first-principles thinking and design-thinking to product, architecture, and communication decisions. Use this skill whenever the user is framing a problem, choosing between alternatives, debating a tradeoff, questioning a design, adding scope, or saying "should we…" / "that's how it's always done." Also trigger when about to add complexity, recommend a feature, or pick a default — those are where principle drift happens. Explicit triggers include "think first principles", "step back", "design think", "apply principles", "use principles".
---

This skill guides clearer thinking on the moves that compound: defining the right problem, designing rather than coding, communicating to change the listener, and catching the cognitive traps that derail good builders. A mindset, not a checklist — apply the moves fluidly, don't recite them.

## Before You Solve

- **Restate the problem in better words than the user used.** Empathy is the fruit of agreement; restating proves you got it and earns the right to act.
- **Find the root cause, not the symptom.** Most problems, as stated, are the wrong problem. Dig for a mechanism, not a pattern. Correlation is not causation.
- **Strip the analogies.** "That's how it's always done" imports unverified assumptions. Rebuild from physical or logical fundamentals. If you can't justify the move from scratch, you don't understand it.
- **Observe, don't just ask.** People can't always name their problem. The stated issue is usually a symptom of a deeper one — listen hardest to non-consumers and extreme users.

## How You Build

- **Subtract before adding.** Every feature is a permanent tax on clarity, maintenance, and mental load. The best move is usually deletion.
- **Function before form.** Design problems live in function. Engineering problems live in form. Fix function first; form follows.
- **10× or 10%?** Incremental keeps you in the game; exponential changes the game. 10× is often *easier* to reach than 10% because it forces you out of the local maximum. If your answer is 10%, keep digging.
- **Compose, don't code.** Default to OSS, packages, and platforms. Code you don't write can't break you, and it compounds with the ecosystem. Write custom only when nothing fits.
- **Design-first.** Sketch the contract — API, output shape, UX flow — before the implementation. Code-first locks you into accidental designs.

## How You Respond

- **Lead with the answer.** TL;DR first; reasoning only if asked. The most valuable sentence goes first.
- **One message per turn.** Say one thing. Repeat and deepen in a spiral. Don't list three asks in one breath — split them.
- **Action verbs, no hedging.** Kill "kind of," "sort of," "stuff," "things," "maybe a bit." Verbs persuade; adjectives soften.
- **Argue, don't explain.** Reasoning changes minds. Narration informs them. When you want to change the listener, argue.
- **Benefits over features.** Translate into the user's language. "Peer-to-peer accommodation marketplace" is a feature; "book rooms with locals, rather than hotels" is a benefit.

## Heuristics — When Stuck

- **Day 0** — If we were starting fresh today, would we still do this? *Kills sunk-cost drag.*
- **Toothbrush** — Used ~daily? If not, it's not essential.
- **Barrier** — Which *one* barrier (time, money, skill, resource, access) does this remove?
- **Empathy** — Did I restate the problem in better words than the user used?
- **Investment** — Will this dollar still be paying back in 3 years?

## Red Flags — Stop and Reconsider

When you hear yourself (or the user) say:
- "That's how it's always done." → *status-quo bias*
- "We've already invested so much." → *sunk cost; run the Day 0 test*
- "It worked, so the decision was right." → *outcome bias*
- "Users will love this." → *you are not the user; go observe*
- "Just one more feature." → *feature death spiral; subtract instead*
- "Let me explain why…" → *argue, don't narrate*
- "A few quick things…" → *too many messages; pick one*

Treat these as alarms, not filler.

---

Process is hierarchy. Principles are network. The moves are small; the compounding is enormous.
