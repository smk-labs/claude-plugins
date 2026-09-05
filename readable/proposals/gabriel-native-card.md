# Proposal: Gabriel stops using the readable card and grows its own

**Status: proposal, parked. Not agreed, not scheduled, not final.**

**To whoever picks this up: do not implement this as written.** It was drafted in
one session from a read of both repos, with no measurement and no discussion with
the people who use the panel. Investigate the question yourself, first-hand, and
treat everything below as one opinion to argue with. If your own reading disagrees
with a claim here, your reading wins — check the code, not this file. Several
claims below are marked as unverified precisely so you re-derive them rather than
inherit them.

Parked in `readable/` rather than in Gabriel because the decision is mostly about
what readable is for, and because that is where the next session on this was
expected to be working.

---

## What is being proposed

Gabriel currently renders its final answer as a readable card. The proposal is
that it stops: it leaves readable's card format entirely, and grows its own
answer mechanism designed for the one surface it actually ships on, an Intercom
sidebar panel.

This is not a fork of readable, and not a version bump. It is Gabriel keeping the
idea (the final answer is a distinct, structured, rendered thing, and the tool
call is what marks it) and dropping the format.

The requirement as the user stated it, in their words, condensed:

- leave the readable card template in Gabriel
- when Claude gives its final answer, have it call a tool that presents the
  answer structured and ideal for that support page
- components should be Gabriel's own; most of readable's are not needed there
- capabilities readable does not have (copy-a-snippet was the example) get built
  into the new mechanism instead of worked around
- no SessionStart hook and no plugin wrapper; Gabriel's own core instructions
  carry the "answer in a card, clean" rule
- readable's CSS and scripts get internalised into Gabriel in some form
- explicitly NOT tracking upstream readable any more, because Gabriel's card
  needs may diverge and a bespoke design is wanted

## Where Gabriel is today

Findings from a read of `gabriel` at the time of writing. Symbols are stable
enough to grep for; line numbers are not, so they are omitted.

- `vendor/readable-card/` is readable **5.6.1** with the plugin wrapper removed.
  Upstream is 6.11.0, so it is roughly five minor versions behind.
- It is registered as an ordinary MCP server per ticket in `src/ticket/workspace.ts`
  (`servers['readable-card']`), pointed at by `config.readableDir` in `src/config.ts`.
- Four local edits marked `GABRIEL` at the top of `vendor/readable-card/server/server.js`.
  Three are font/CSP changes. The fourth **reverses the server's refusal message**:
  as shipped, when the host cannot negotiate card rendering the server tells the
  model the card was not rendered and to stop calling the tool. Gabriel's copy says
  it was delivered and to carry on.
- **The vendored server never renders anything in Gabriel.** The panel draws the
  card itself from the tool call's own input: see `cardOf` and `renderCard` in
  `panel/index.html`. Gabriel's own README says the tool survives "not for
  rendering: the *call* is the marker that separates the final answer from
  narration during work."
- The card CSS exists **twice**: `vendor/readable-card/assets/rc.css`, and a
  second copy inlined in `panel/index.html` as `const KIT`, which is what actually
  paints. The two have already diverged.
- `vendor/readable-card/package.json` exists only to mark the vendored tree as
  CommonJS inside an ESM repo, and `test/vendor.test.ts` exists only to catch the
  silent death that mismatch caused once.
- `splitDraft` cuts the merchant-facing draft reply out of the card HTML and
  renders it **outside** the iframe, because a sandboxed frame cannot run a copy
  handler. `renderDraft` then adds copy and insert controls beside it.

## The argument, in three parts

Each of these should be re-checked before it is believed.

### 1. readable's vocabulary is sized for the wrong column

readable's kit is a general-purpose document vocabulary: tables, KPI tiles,
donut, sparkline, hub, timeline, flow, numbered sections, scroll-tables. It is
designed against a chat column in the region of 680px.

Gabriel's card lives in the Intercom sidebar. Gabriel's own panel comments cite
measurements of that sidebar in the 264–285px range. A large part of readable's
vocabulary cannot survive that width, so Gabriel is carrying a ~50KB stylesheet
for a handful of blocks it actually uses.

**Unverified:** nobody has counted which blocks Gabriel's cards actually contain
in production. That count is the first thing the next session should get, and it
may well kill or reshape this whole proposal. `specimen()` in `panel/index.html`
is a starting point but it is a design specimen, not evidence of real usage.
Real transcripts are the evidence.

### 2. The draft is the most important thing on the card and the format has no
concept of it

For a support person, the payload of a Gabriel answer is the reply they will
paste into Intercom. readable's format does not know that object exists, so
Gabriel has to cut it out of a string (`splitDraft`) and render it outside the
sandboxed frame to give it a copy button.

That is not a hack to tidy up. It is the format saying it is the wrong format for
this job.

### 3. Structured input lets the iframe go, and the iframe is expensive

Today the tool takes HTML. The panel cannot trust model-authored markup, so it
renders it in a sandboxed iframe whose height is unknown until after load. A
large amount of the most delicate code in `panel/index.html` exists purely to
manage that:

- measuring the iframe body rather than its document element, with the
  "a card that measures zero is not finished" rule
- `outerRO` and the inner ResizeObserver, `syncFrame`, `syncFrames`
- `resizeInPlace`, and the `overflow-anchor: none` exception carved out for
  cards specifically
- the jump-on-open behaviour that all of the above was written to fix

If the tool instead takes structured data and the panel builds the DOM itself,
the content is no longer untrusted markup, the iframe is unnecessary, and every
item above goes with it. Card CSS becomes ordinary panel CSS in the panel's own
tokens.

This is the strongest argument in the proposal and also the one most likely to
have a hole in it. **Find the hole before building on it.** In particular: is
there any card content today that genuinely needs arbitrary HTML? If yes, how
often, and what would it degrade to?

## Sketch of the mechanism

Deliberately a sketch. The shape of the schema is the actual design work and it
should not be settled from this file.

**The tool stays.** Its call is the marker that separates the final answer from
narration, and that role is load-bearing in Gabriel today. What changes is the
input: from a blob of HTML to a validated object. A malformed answer then comes
back to the model as a tool error it can correct, instead of painting a broken
box in somebody's sidebar.

**The schema is Gabriel's, not readable's.** Something in the spirit of a verdict,
the evidence behind it, the draft reply, and references — but the real field list
comes from real tickets, not from this file.

**The draft is a first-class field**, with copy and insert as ordinary panel
controls. This is where the "capabilities readable does not have" requirement
lands: they stop being capabilities of a card format and become capabilities of
Gabriel's answer.

**One escape hatch.** Structured output is less expressive, and the first time
support needs something unmodelled the model has nowhere to put it. Keep a free
field rendered through a restricted renderer of Gabriel's own — not raw HTML.
Decide the restriction deliberately.

**Instructions carry tone and timing; the schema carries shape.** The user's
instinct to move this into Gabriel's core instructions is right for *when* to
answer and *how it should read*. It is wrong for the shape: prose drifts over a
long session, a schema does not, because a wrong shape returns an error. Put the
voice in the instructions and `claude/skills/reply`; leave the shape in the tool.

**What survives from readable** is typography, not code: `unicode-bidi: plaintext`
per block, direction from the first strong character, Vazirmatn for Persian, mono
reserved for machine output. Gabriel's panel already implements all four. So
"internalise readable's CSS" is mostly a deletion, not an import.

## Rough sequencing

Do not treat this as a work breakdown; it is the order the dependencies seem to
run in.

1. **Count what is actually used.** Which blocks appear in real Gabriel cards,
   how often, and at what width. Everything downstream depends on this and it is
   the step most likely to change the answer.
2. **Draft the schema from that count**, plus the draft-reply object.
3. **Build the renderer beside the current one**, not in place of it. The panel
   already renders per kind; a new kind is not disruptive.
4. **Cut the iframe** only once the new renderer covers real cards, and take the
   measuring machinery with it in the same change.
5. **Then remove the vendor**: `vendor/readable-card/`, the `readable-card` entry
   in `src/ticket/workspace.ts`, `config.readableDir`, the CommonJS marker, and
   `test/vendor.test.ts`. Replace that test with one that asserts the new tool is
   offered and its input renders.
6. **Update Gabriel's README section** "The readable card server, vendored",
   which will otherwise describe something that no longer exists.

## Costs and open questions

- This is a real rewrite of `renderCard` and everything around it, plus the reply
  skill, plus the specimen sheet, plus tests. It is not a cleanup.
- Gabriel loses readable's future work. The user has accepted this explicitly and
  it is the premise of the proposal, not a risk to mitigate.
- Open: does anything other than the panel consume Gabriel's cards? The publisher
  and digest directories were not examined for this. Check before deleting.
- Open: `vendor/readable-card/reference/card-vocabulary.md` is what the model
  writes against today. Whatever replaces it needs to be as concrete, and it
  needs to live where the model will actually read it.
- Open: whether any of this is worth doing before the panel's other pending work.
  Nobody has weighed it against anything else.

## Provenance

Drafted 2026-09-05 from a session that read `local-remote`, `gabriel` and
`readable` in one sitting. The Gabriel findings above come from that read and
have not been reviewed by anyone. Repos are resolved through `~/Projects`:
`./daftar find gabriel`, `./daftar find claude-plugins`.
