# Astera Studio: clickable mockup

A responsive, touch-friendly HTML mockup of Astera Studio for iPhone, iPad and desktop. Ask a question, get a chart with a short summary, pin it to a dashboard, and check or lightly edit the pipeline behind it.

## How to open it

No build step and no server. Open the files in a browser (tested in Chrome; works from `file://`):

- **`index.html`** shows the same live app in iPhone, iPad and desktop frames side by side. Every frame is clickable.
- **`app.html`** is the app itself. Open it directly, or resize the window: the layout changes at 700 px, from a bottom bar to a top bar.
- **`NOTE.pdf`** (and `NOTE.md`) is the one-page design note.

The sample data is made up. Nothing is saved, so a reload starts fresh.

## Things to try

1. **Ask and pin:** on Ask, tap "Which regions missed their sales target last quarter?". Switch Bars and Table, or tap a follow-up under the chart to redraw it. Then **Pin to dashboard**, choose a dashboard (or **New dashboard**), and tap **View**.
2. **Chats:** past chats slide in from the left, grouped Today and Earlier, with **New chat** at the top (two are there already). On iPhone and iPad the menu button at the top left opens them from any screen, with the account at the foot of the drawer, and iPad keeps **New chat** in the top bar beside the circles. On desktop the bottom of the left rail holds the chats (☰), New chat and Settings, so they work from any screen. **⋯** on a chat opens or deletes it.
3. **Questions a dashboard can't answer:** on Dashboard, tap **+ New** and create "Q4 review". It starts empty with four questions. Tap one and watch the agent tick off its steps; the answer's button reads **Pin to Q4 review**.
   - **What explains the gap to target in Q3?** A bridge chart from the total target to actual sales, one step per region.
   - **How much revenue is at risk?** A new figure. **Pin as a figure** adds it to the figure row.
   - **What is revenue per active customer by region?** Joins Daily sales with Customer 360.
   - **Will we hit the Q4 target?** October's actual sales, November and December projected with a range.
   - **How I made this**, under any answer, lists the steps and the pipelines it read.
4. **Dashboard:** every dashboard is a tab. Two pipelines have failed, so one red line says "Two pipelines failed" and which figures are stale. **Show** lists them; **Re-run all** fixes both and the line clears when the runs finish.
   - **Figures:** tap **Add a figure** (desktop) or **Add or remove figures** (iPad, iPhone) to pin up to four. A figure mentions freshness only when it is not current (From Oct 29, Updating now).
   - **Region:** tap **Global** for the globe. Pick a continent, then a country if you need one, then **Show**.
   - **Date range:** this year's quarters up front; earlier years under **Archive**, each labelled with its year (Q3 2025).
5. **Pipelines:** the strip at the top counts Failed, Running, Succeeded and Scheduled; tap a count to filter. Open **Regional targets**:
   - The last 10 runs show when it failed before.
   - On iPhone the steps are a numbered list. The failed step shows a one-line reason and **Re-run from here**; **Details** opens the full error, **Wait longer** and **Ask why**.
   - Choose **Wait longer**, pick **10 min**, then **Save and re-run**. **Map** shows the whole pipeline at once.
6. **The action dial:**
   - Tap the filled circle (bottom on iPhone, top on iPad, left rail on desktop) for actions on the current screen.
   - Tap **⋯** on a chart or step for actions on that item, or long-press it (touch) or right-click it (mouse).
   - The dial's center has search (top), close (bottom left) and a pencil (bottom right) that chooses what fills the dial: **Recommended**, **Most used** or **My choice**.
   - **Search**, the circle next to the places, lists what you can do on this screen and narrows as you type. With a keyboard, Ctrl+K (Cmd+K) does the same.
7. **Account:** at the foot of the chats drawer on iPhone and iPad, and the settings icon at the bottom of the rail on desktop. It holds Organization, Billing, Settings and Sign out (placeholders).

## Screen sizes

| Width | Layout |
|---|---|
| iPhone, 375 px | Bottom bar with the three places and Search. The top row holds the menu plus what the screen needs: dashboard tabs, the way back from a pipeline, or the chat's name and New chat. The menu button always opens the chats drawer. Pipelines as a numbered list of steps, details in a bottom sheet. |
| iPad portrait, 768 to 999 px | The same circles at the top, menu at the top left opens the chats from any screen; on Ask, New chat sits at the top right. Pipeline canvas flows top to bottom, step details in a side sheet. |
| iPad landscape, 1000 to 1279 px | Same top bar, plus breadcrumbs. Pinned figures in one row, charts side by side. |
| Desktop, 1280 px and up | The circles and Search move to a narrow rail on the left, with Chats, New chat and Settings at its foot, so the content gets the full height. Pipeline canvas flows left to right when it fits, with an inspector under it. |

Desktop has no sidebar and no docked chat panel. They would use the wide screen, but they made it busy, and the circles already lead to every place. Every size works the same way.

## Files

```
index.html          device showcase
app.html            the app
css/                font.css (embedded font), tokens.css, app.css, charts.css, dial.css, globe.css
js/                 data.js (sample data), charts.js, dial.js, globe.js (region globe),
                    geo.js (land dots), app.js, icons.js (icon sprite)
assets/             fonts/ (Public Sans, OFL) and icons/ (Iconoir SVG sources)
NOTE.md, NOTE.pdf   design note
```

Plain HTML, CSS and JavaScript with no framework or dependencies. Charts are hand-built HTML and SVG. Every bar is a button, so values and drill-down work by tap, mouse or keyboard, and nothing depends on hover.

## Checks run

- **Screenshots:** headless Chrome at 375, 834, 1024 and 1440 px. No horizontal scrolling, no console errors.
- **Flows:** scripted checks for chats (ask, new chat, reopen, delete), the grouped failure line and Re-run all, the failed-step Details, the globe, the archive, pinning figures, the status strip filter and search.
- **Touch:** every control is at least 44 px on touch screens.
- **Accessibility:** status is always an icon plus a word. All text colors meet WCAG AA contrast (4.5:1).
- **Motion:** reduced motion turns movement into fades.

## Credits

Design tools and skills that shaped this mockup:

- [Pablooo](https://pablooo.club): a library of screens from shipped apps, used to check chat history, status lists and pipeline run history against real products.
- [Claude Code](https://claude.com/claude-code), steered by these open-source design skills:
  - Emil Kowalski: [emilkowalski/skills](https://github.com/emilkowalski/skills)
  - Jakub Krehel: [jakubkrehel/skills](https://github.com/jakubkrehel/skills)
  - Meng To: [MengTo/Skills](https://github.com/MengTo/Skills) (no-ai-design-slop)
  - tastemaker: [codeswithroh/tastemaker](https://github.com/codeswithroh/tastemaker)
  - garden-skills: [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills)
  - designer-skills: [Owl-Listener/designer-skills](https://github.com/Owl-Listener/designer-skills)
  - landing-page-design: [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills)
  - Anthropic's frontend-design skill
- ChatGPT image generation for the early concept boards.

Assets:

- Typeface: [Public Sans](https://github.com/uswds/public-sans), SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
- Icons: [Iconoir](https://iconoir.com), MIT License.
- Globe land dots: generated from [Natural Earth](https://www.naturalearthdata.com) 1:110m countries, public domain.
