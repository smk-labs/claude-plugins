---
name: visualize
description: Turn an answer into a light visual (flowchart, timeline, comparison, architecture sketch) whenever a shape says it better than text, in any language at any time. Trigger when the user asks to "visualize this", "show it as a diagram", "draw it", "make this easier to understand", "با شکل نشون بده", "شماتیکش رو بکش", "تصویریش کن", or when an explanation involves flows, cycles, hierarchies, timelines, or comparisons that plain text conveys poorly. Uses the widget tool with minimal, theme-aware SVG.
---

# visualize: a shape, only when it says it better

Render ONE light visual with `mcp__visualize__show_widget`. If this is the first widget of the session, call `mcp__visualize__read_me` first (silently) with the closest module (`diagram` for flows and structures, `chart` for data).

Rules:

- SVG first. HTML only for metric cards or side-by-side comparisons.
- Light: a few dozen elements at most, one idea per visual. If it needs more, split it into two visuals or stay in text.
- Colors: only the theme's CSS variables and ramp classes (`c-gray`, `c-purple`, `c-teal`, `c-coral`). Never raw hex that breaks dark mode. 2-3 colors, gray for structural nodes, color only where it encodes meaning.
- Labels stay short (under 5 words). Explanations belong in the chat text, never inside the visual.
- Persian/RTL labels: set `direction="rtl"` on RTL `<text>` elements and keep Latin tokens out of them. Latin-only labels stay LTR.
- If the current reply is already a Persian `<md>` card (readable's RTL hook), embed the visual as a small inline `<svg>` inside that markdown instead of a second widget call.
- Never force it: if no shape genuinely helps, say so and answer in text.
