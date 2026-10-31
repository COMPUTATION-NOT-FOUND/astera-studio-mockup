# Astera Studio mockup: design note

## Main ideas

- **Consistency over filling every pixel.** On desktop, chat and the pipeline could sit in side panels next to the dashboard. It used the space, but it looked busy. Every screen size uses the same navigation instead: three circles (Ask, Dashboard, Pipelines) and Search. Ask opens full screen. Past chats slide in from the left, like assistant apps. On iPhone and iPad the menu button always opens them, on every screen, with the account at the foot: one button with one job, instead of two lookalike icons. Desktop keeps Chats, New chat and Settings at the foot of the rail.
- **A radial dial for actions.** A phone has no room for a toolbar, so the circle you are on is also an action dial with up to six labelled slots that stay in place. Its center holds search, close and customize. Today some slots repeat buttons that are already on screen; that matters less as features grow, and search can later become a cascading menu that groups actions.
- **Dashboards people build.** Every dashboard is a tab, with **+ New** at the end. An answer pins straight back to the dashboard it was asked from.
- **A globe instead of a region dropdown.** A long list made it easy to pick the wrong region and read the wrong dashboard. The globe shows where you are, and nothing changes until you tap **Show**.
- **Freshness next to the number.** A figure only mentions freshness when something is wrong (From Oct 29, Updating now). Status is always an icon plus a word.

## Pipeline detail: show the important part first

The screen is built in layers, so a business user can stop early and an engineer can keep going:

1. **What needs attention.** The status strip counts Failed, Running, Succeeded and Scheduled, and each count is a filter. Failed pipelines come first.
2. **When it failed.** The pipeline page shows the last 10 runs as a small bar chart, so a one-off failure looks different from a pattern.
3. **Where it failed.** The steps show which one failed, with a one-line reason and **Re-run from here**. **Details** opens the full error, **Wait longer** and **Ask why**.
4. **Everything else.** **Map** shows the whole graph. Tapping a step opens Settings, Preview and Log.

On desktop the steps are a canvas that reads left to right. On iPhone a canvas would need 7 px text, so the steps become a numbered list, with the database shown as a branch. Several failures never stack up: the dashboard shows one line ("Two pipelines failed") with **Re-run all**, and the list opens on demand. Light edits (a filter value, a timeout, skipping a step) wait in an "unsaved changes" bar until you save.

## Tried and dropped

- **A zoomable pipeline canvas on the phone.** When it fits a 375 px screen, the text is about 7 px and tap targets are far below 44 px. Zooming in loses the overview. The numbered list plus Map keeps both.
- **Side panels on desktop** for chat and the pipeline. They used the space but made the screen feel crowded.
- **A region dropdown,** replaced by the globe for the reason above.

## Known limits

The dial suits touch. A desktop user with a precise mouse who uses more than about seven actions often will find a ring slower than a toolbar. Keyboard shortcuts and Ctrl+K search are the next step for those users.

## AI tools

- **ChatGPT image generation** for early concept boards. The radial menu came from one of them.
- **Pablooo** (pablooo.club), a library of screens from shipped apps, to check patterns such as chat history, status lists and pipeline run history against real products.
- **Claude Code** for research, design and code, steered by open-source design skills: Anthropic's frontend-design, Emil Kowalski, Jakub Krehel, Meng To (no-ai-design-slop), tastemaker, garden-skills, designer-skills and landing-page-design. Links are in the README.

Key prompts: (1) the brief, plus "each layout must adapt, not shrink". (2) "This board is the cleanest. Focus on the radial button that compacts actions, but it lacks the criteria in the brief." (3) "Multiple failed pipelines can clog the screen. Make them collapsible and lower the cognitive load on iPhone."

**My part:** I did not hand-write the code. I worked as art director and reviewer: after each build I took screenshots at each screen size, marked in Paint what felt wrong (crowded failure cards, a single chat, a region list that invited mistakes, busy desktop panels), and turned those marks into the next round of changes. The decisions in this note came out of that loop.
