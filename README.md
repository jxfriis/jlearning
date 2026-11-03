# jlearning

A Chrome extension that gives itslearning the look and motion of Friis: raised and inset 3D surfaces, and
things that squash when pressed and spring back with a little overshoot. Friis's charcoal is tinted with
itslearning's aubergine, and its accent becomes the itslearning orange. Each course keeps its own colour, as a
wash on its card.

jlearning is an independent hobby project with no connection to itslearning.

## Install
Get it from [jlearning.pages.dev](https://jlearning.pages.dev/), which has a step-by-step guide, or:

1. Unzip `jlearning.zip` from the [latest release](https://github.com/jxfriis/jlearning/releases/latest).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Press **Load unpacked** and pick the unzipped folder.
4. Open itslearning. The switch in the top bar flips light and dark. The toolbar icon also has Auto (follows
   Windows) and Off.

After changing any file here, press the reload arrow on the extension's card in `chrome://extensions`.

## The room view
The "Overskuelig visning" switch in a room's title row removes the tabs under the title and moves everything to "Mere".
The room's name leads back to its front page, where Ressourcer and Planer are the two main cards, posts get the wide
column, and the latest changes, tasks and events share a narrow one. Back and forward buttons sit first in the title
row on every page in a room, and Ressourcer always opens a folder with the newest first.

## The readers
PDFs and PowerPoints open in jlearning's reader: the same viewers (PDF.js and Microsoft's PowerPoint viewer) with our
look and bigger controls, so the documents still render exactly as before. The switch beside the file's open link
flips between ours and theirs, one setting per file type, and the toolbar popup has the same two switches.
`readers.css` holds the styling. Microsoft can change its viewer at any time, which could break the PowerPoint skin;
if it does, the switch brings back the original.

Needs Chrome 120 or newer. Also loads in Edge.

## How it stays light
- `content.js` only sets an attribute on `<html>`. Everything else is CSS, so nothing runs while you browse.
- Motion is CSS as well: entrances are keyframes, presses are `:active` transitions. The spring curves are
  Friis's own, sampled into `linear()` easings.
- Covers every frame on `*.itslearning.com`, including the old pages the site shows in iframes.
- `prefers-reduced-motion` turns the motion off.

## How it makes the site faster
- **Hover prefetch:** touching a link with the pointer fetches the page, and resting on it renders the page unseen,
  so the click skips the second or so the server takes to build it. Listed pages only (see `content.js`); plan
  elements are excluded, because opening one can mark it as read. Hovering a course may count as a visit for
  itslearning's "Senest besøgt" sort.
- **Folders in Ressourcer** (`fast-resources.js`): touching a folder fetches its contents, so it opens at once. Answers
  are kept for a minute, which also makes going back instant; a reload always asks the server again.
- **Instant click feedback:** the clicked link breathes, the nav pill hops to it, and a bar runs along the top.
- **Blocks the Immersive Reader script** (`rules.json`), a third-party script that holds up every page. The
  Immersive Reader button stops working; delete the rule if you use it.
- **Skips rendering off-screen blocks** on long course pages, and only animates what's on screen at load.

## Files
- `tokens.css`: the palette.
- `theme.css`: the Friis look, by hand. Start here to change how something looks.
- `readers.css`: the PDF and PowerPoint readers.
- `generated/site-dark.css`: itslearning's own stylesheets, reduced to their colours and remapped to dark.
- `generated/icons/`: the site's dark icons, recoloured for a dark page. Pages load only the ones they show.
- `generated/easing.css`: spring curves and course colours.
- `transform.mjs`: the colour conversion, shared by the build and `content.js`.
- `tools/generate.js`: builds `generated/`.

## When itslearning changes
Class names are stable across their version bumps, so the skin keeps working. To pick up new styles, take the
version from any `cdn.itslearning.com/vXXXX/...` URL on the site, then:
```bash
node tools/generate.js v2026.10.4.5595
```
A stylesheet not listed in `SHEETS` at the top of that file gets converted in the browser the first time it's seen,
then cached, so it may flash light once. Add it to the list to avoid that. A frame that still ends up white, like
the quiz player, falls back to the site's own colours.

## Known limits
- Embedded content from other sites (link previews, videos) stays as those sites made it.
- Text with colours a teacher set by hand is only adjusted for plain black text and white backgrounds.
