# learnable, the mark

A closed book with a bookmark still in it.

The frame of the cover is deliberately interrupted at the top, and the bookmark comes up through that gap, so it reads as a ribbon sitting *inside* the book rather than a shape pasted on top of a box. The tail is forked, a V cut into the bottom edge, which is what a real ribbon does when it frays and what stops the shape from reading as a plain rectangle.

## Why this and not the obvious thing

The interesting fact about learnable is not that it teaches. It is that it **waits**. Nothing advances until you say so, and you leave in the middle of a book and come back a week later. A bookmark is exactly that: a promise that the page you stopped on is still yours.

A graduation cap says authority. A lightbulb says a moment of genius, which is the opposite of how this works. A brain says nothing at all. A bookmark says come back, and it happens to be the single most reduced book shape that still says book.

It is also family with **readable**, the sibling plugin: same line weight, same rounded joins, same one-idea-only discipline.

## The files

| file | grid | stroke | for |
| --- | --- | --- | --- |
| `icon.svg` | 24 | 2 | the default, anywhere from 18 to 96 pixels |
| `icon-16.svg` | 16 | 1.5 | menu bars, tabs, tree rows, anything at 14 to 18 pixels |
| `icon-512.svg` | 24 | 1.75 | display sizes, where 2 starts to look heavy |

Three files rather than one because the notch is the part that dies first. On the 24 grid the V is 2.4 units deep, which is about 1.6 pixels at 16 and starts to fill in. `icon-16.svg` is redrawn on a 16 grid with a proportionally deeper notch and a thinner stroke, so the fork survives. At 512 the opposite problem appears and the stroke is lightened.

All three use `currentColor`, so they inherit their colour from wherever they sit. Never hardcode a fill.

## The mark, inline

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">
  <path d="M9.5 2.5H7A2 2 0 0 0 5 4.5v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-15a2 2 0 0 0-2-2h-2.5"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 1h4v11l-2-2.4-2 2.4z" fill="currentColor"/>
</svg>
```

## Palette

Small on purpose. One colour carries the brand, one carries progress, everything else gets out of the way.

| role | light | dark | used for |
| --- | --- | --- | --- |
| teal | `#0E6A62` | `#6FC9BB` | the mark, links, the primary button, anything the brand signs |
| ink | `#1E211F` | `#ECEEEC` | body text |
| paper | `#F4F4F1` | `#191B1A` | background |
| muted | `#6E7472` | `#99A09D` | labels, captions, secondary text |
| rule | `#DEDED8` | `#2B2E2C` | borders, dividers, table lines |
| accent | `#C0782E` | `#E5A860` | progress, a finished book, the milestone card |

Teal because it is the calmest colour that is still a colour: it reads as patient rather than urgent, and it is nobody's alert state. The accent is a warm amber picked from the bookmark itself, so celebration and progress use the ribbon's own colour rather than importing a green tick from somewhere else.

For text on light paper the accent is too pale. Use `#8A5214` when amber has to carry words.

## Type

No custom logotype, and no font nobody has.

- Latin: **Inter**, or the system sans. Weight 600 for the wordmark, tight tracking, always lowercase. learnable is never capitalised, the same way readable is not.
- Persian and Arabic: **Vazirmatn**. It is what readable already sets, so the family stays consistent, and it holds up next to this teal at small sizes.

## What it must never become

- No gradient. This mark is one flat colour and one stroke.
- No pages, no page-curl, no stack of three books. Every one of those was tried and every one turned to mush below 20 pixels.
- No cap, no lightbulb, no brain, no owl, no apple.
- Never fill the cover. The book is an outline and the bookmark is solid; that contrast is the whole drawing.
- Never straighten the tail into a flat or diagonal cut. That was the runner-up and it reads as a placeholder.

## The runners-up

Kept in `_preview.html`, which is the exploration sheet at every size in both modes. Worth knowing why they lost, because the same ideas will come back:

- **Plain diagonal tail.** The first version of this direction. Clean, but it reads as a generic toolbar bookmark rather than a ribbon in a book.
- **Bookmark hanging inside, frame unbroken.** Safer and duller. Without the gap the ribbon looks printed on the cover.
- **Off-centre ribbon.** More natural, but at 16 pixels the asymmetry looks like a mistake instead of a choice.
- **Open book as a chevron.** Beautiful at 96 pixels, unreadable at 16.
- **Page mid-turn, two leaves.** Carried motion, which was the right idea, but needs four strokes and they merge.
- **Progress band filling a page.** Said progress clearly, said book barely.
- **Dog-eared corner.** Says folded paper, and reads as a warning triangle at small sizes.
- **Two vertical bars, a book seen from above.** Doubles as a pause glyph, which was the wittiest option here, and completely illegible as a book on its own.
