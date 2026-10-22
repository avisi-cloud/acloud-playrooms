# UI roadmap

What could make the app's UI better, in the order worth doing it. Each item says
what is wrong, why it matters and where it lives, so it can be picked up without
re-auditing. Nothing here is decided: an item becomes work when someone takes it.

The list comes from a read-through of every screen's template and stylesheet,
measured contrast ratios, and a pass with the
[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill
(enabled for this project in `.claude/settings.json`). Its desktop checklist,
`references/quick-reference.md`, was used; its `pro-rules.md` is written for
mobile, so its 44pt touch targets do not apply here.

Everything below stays inside the rules in [FRONTEND.md](FRONTEND.md#design): a
dense operational console, one loading indicator, delete behind an overflow
menu, no hero layouts or decorative graphics. An item that pushes against one of
them is marked **(debatable)**.

Effort: **S** under half a day · **M** half a day to two days · **L** more.

## Kept on purpose

The background artwork, the Avisi blue, cyan and green, Poppins for the brand
and titles, the breathing brand mark, typed delete confirmation, drawers for
creating and dialogs for deciding, the dense card grid, no skeleton screens, and
sticky failure toasts. None of the items below changes them.

## P1 — Readability and accessibility

1. **`--tx-3` fails contrast.** Light: 2.56:1 on `--win`, 2.74:1 on white.
   Dark: 2.96:1 on `--surf-2`. It carries page subtitles, field hints, card
   labels and section labels. About `#5a7480` (light) and `#83a0ae` (dark) reach
   4.5:1. `shared/styles/_tokens.css`. S
2. **Status colours fail as text in light mode.** `--ok` is 2.8:1 on white,
   `--cyan` (the card's host line) 3.33:1. Add text-strength variants, such as
   `#067a4a` (5.4:1) and `#0b7a8f` (5.0:1), and keep the current colours for
   dots and fills. S
3. **Type is small and has no scale.** 62 declarations are under 12px, across
   22 distinct sizes. Poppins is wide and gets hard to read below 11px. Add size
   tokens (11, 12, 13, 14, 16, 21), keep 11px as the floor for uppercase labels,
   and give values such as age, disk and CPU `tabular-nums`. S–M
4. **Unlabelled form controls.** The `label-has-associated-control` warnings:
   bind each `<label for>` to the control's `inputId`, the pattern the 0.37
   controls already use. M
5. **Information only in `title`.** Tool status, the compatibility warning, the
   card flavour and truncated names (card name, scope pickers, host) are only
   in a native tooltip, which the keyboard cannot reach. Use `pTooltip`, which
   also shows on focus, and give tool rows a state word. S
6. **Icon-only buttons named only by `title`.** The activity log's copy, clear
   and close, and the Playhouses row actions, need an `aria-label`. S
7. **Room status changes are not announced.** A polite live region that says
   "demo is ready" when a transitional room settles. S
8. **Focus ring on dark headers.** Cyan on the navy card head and overlay
   headers is low contrast. Extend the sidebar's light-ring override to them. S
9. **Field errors are not tied to their field.** Hints and errors are a
   `<small>` beside the input, with no `aria-describedby` and no `role="alert"`
   (only `acloud-binary` and the Defaults resource warning have one). The skill
   rates both High. S–M
10. **Focus stays put after navigation.** After a route change, move focus to
    the page heading, so a screen reader starts on the new screen. S
11. **Heading levels skip.** Pages use `h1` and their empty states `h3`. S

## P2 — Design-system consistency

These make everything after them cheaper.

12. **Colours outside the tokens.** 27 hex values in six files (12 in
    `_overlays.css`) and 75 `rgba()` literals. Most are the "on dark" set used
    by the sidebar, card heads and overlay headers, which stay dark in both
    themes: give that set its own tokens. S–M
13. **Two copies of the brand gradient.** The card head and `--overlay-head`
    have already drifted apart (45% and 58%). One token. S
14. **Radius drift.** 3, 4, 5, 6, 8, 16, 18 and 999px next to the three radius
    tokens. Settle on one scale. S
15. **No spacing scale.** Paddings are 26, 22, 18, 14, 12 and 7px. A 4px-based
    scale, starting in `shared/styles/`. M
16. **No motion tokens.** Five durations, and `transition: all` in
    `_surfaces.css` and `wizard-stepper.css`. Three duration tokens and one
    easing; name the transitioned properties. S
17. **PrimeNG overrides through `::ng-deep`.** Move button, toast, select and
    tag styling into component tokens in the preset in `app.config.ts`. M
18. **No layer scale.** Toasts sit at `z-index: 9999 !important`. A small,
    named set of layers. S
19. Two inline `style="font-size: 1.75rem"` in `rooms.html` and
    `room-detail.html`. S

## P3 — Shell, background and depth

20. **Let the artwork reach the controls.** The scope pickers and footer rows
    get a light glass treatment (`backdrop-filter`, a 1px top highlight). The
    areas are small, so this costs little, unlike the full-shell blur that was
    removed. S
21. **Depth in dark mode.** Cards, the panel and overlays sit flat. A 1px inner
    highlight and a two-layer shadow make elevation read as layers. S
22. **Panel glass (debatable).** In dark mode, a panel at about 92% opacity so
    the artwork's lines show faintly behind the header. Measure resize and
    scroll cost in WKWebView before keeping it. M
23. **The installed-tool dots pulse forever** (`tool-pulse` in
    `app-sidebar.css`). The cards already follow the rule that a steady state
    gets a steady dot. S
24. **The brand block holds three tiny lines** (13, 10 and 9.5px). Keep the
    name; move the version and compatibility note somewhere quieter. S
25. **Context, organisation and playhouse are three identical dropdowns.**
    Group them in one block that shows the hierarchy. M
26. **Theme row.** A compact Light / Dark / System control. System follows
    macOS through `prefers-color-scheme`; today there is no System mode. S–M
27. **Only the traffic-light strip and brand block drag the window.** Make the
    page header a drag region too, with its controls excluded. S

## P4 — Speed for people who use it all day

28. **Command palette (⌘K)** to jump to a playroom or playhouse, switch scope,
    and run Connect, Start, Stop or Create. L
29. **Mac shortcuts everywhere.** Today only the Playrooms screen has `c`, `/`
    and `esc`. Add ⌘N, ⌘R, ⌘, for Defaults, ⌘1 and ⌘2, and `?` for a list,
    ideally mirrored in the native app menu. M
30. **Right-click menus** on room cards and playhouse rows, with the ⋯ items. S
31. **Status filters with counts** (Ready 3 · Stopped 5 · Failed 1), which also
    replace the "12 rooms · 4 mine" line, plus a sort. M
32. **A dense list view** next to the grid, remembered in `shared/utils/cache.ts`. M
33. **Copy where it matters**, with the icon turning into a check instead of a
    toast: the card's host, the image, the ports, an `ssh <host>` line. S
34. **The search and Mine filter reset** on coming back from a room, because
    they live on the destroyed component. Keep them in `PlayroomStateService`. S

## P5 — Screen by screen

**Playrooms**

35. **Every card shouts equally.** Mute stopped rooms so ready and failed ones
    stand out. S
36. **A thin progress bar** along the card head for creating, starting and
    deleting, instead of only a blinking dot. S
37. **Rooms pop in and out between polls.** A short enter and exit, and a
    pressed state on the card. S

**Room detail**

38. **Primary actions in the header,** next to the status tag, as on the other
    screens. S
39. **A connect block** like the command preview: `ssh <host>` with copy. S

**Playhouses**

40. **Delete sits beside routine actions** as an outlined red button, while the
    cards keep it behind ⋯. Keep the actions column first (that was deliberate,
    so the buttons do not move as columns drop away) and move Delete into ⋯. S
41. **The provisioning banner** could show the elapsed time against the ~20
    minute expectation (see 47 for the notification). S–M

**Overlays and forms**

42. **Drawer and dialog motion:** enter in about 220ms, leave faster. Check
    whether the 2px shell blur still earns its cost. S
43. **Command preview:** flags in a separate colour from values, and a Copy
    button with a "Copied" state. S
44. **A half-filled create wizard is lost with one click.** A click outside the
    drawer or Esc closes it, and the next open starts blank (`ngOnChanges`
    resets the form). Keep the draft until Create or Cancel, or ask first. S–M
45. **Wizard:** show completion and errors on the stepper; ⌘↵ submits. S

**Feedback**

46. **Loading (debatable).** The breathing mark sits at 4–34% opacity in a
    corner that content often covers. A 2px bar along the panel's top edge, on
    the same `shellBusy()` signal, stays one indicator. S
47. **Toasts in the app's own style:** the overlay chrome, a status bar, and an
    11px "View command" link instead of 9.5px. S
48. **Activity log:** timestamps and durations per command, an exit-status
    chip, collapsible output, a failures-only filter. M

## P6 — Native macOS feel

49. **Notifications** when a long create, delete or start finishes while the
    window is in the background. M
50. **A window title per route** ("demo — Playrooms") through a
    `TitleStrategy`, for the Window menu and Mission Control. S
51. **UI text is selectable.** Click-dragging selects labels and buttons; keep
    only values such as names, hosts and images selectable. S
52. **View Transitions** between routes (`withViewTransitions()`), honouring
    reduced motion. S
53. **Template-driven forms (debatable).** The skill's Angular guidance prefers
    reactive forms for forms as large as the create wizard. An architecture
    change, not a visual one; worth it only alongside other form work. L

## P7 — The 0.37 create and update options

Reviewed after the 0.37 work landed. It already binds every new label, groups
Defaults under Security, and says why Update is disabled.

**In progress on `feat/ui-0.37-polish`:** a "Configured default" capabilities
option in create; option hints in the Exposure and Capabilities lists; the
Options step grouped as Networking, Behaviour and Security, like Defaults; one
"Advanced" section for capabilities and privileged mode; images that need
privileged mode marked in the list, with a "Go to Options" action on the error;
a danger "Update and delete namespace" button; the current storage size as a
lasting hint, with sizes that do not grow refused; and the rest of the Options
step's labels bound.

Still open:

54. **Privileged mode and capabilities look independent.** Privileged grants
    every capability; once the CLI's behaviour is confirmed, say so beside the
    capabilities while privileged is on. S
55. **Acknowledgements are switches.** "I understand…" for privileged mode and
    for removing the namespace are `p-toggleswitch`, which reads as a setting.
    Consent is a checkbox, but the app has none yet, so this is a decision for
    the whole app. S
56. **"Change X" then "remove all" then a list.** The update drawer repeats
    this three-level shape for ports, read-only, added capabilities and the
    namespace. Each is a three-way choice (keep, replace, remove all), which
    one segmented control could say in one row. M
57. **No "what changed" cue in a seven-card update drawer.** Mark edited cards
    with the cyan unsaved tint the Defaults screen already uses. S
58. **The Defaults `privileged` toggle only affects the terminal.** The create
    drawer always starts privileged off and sends `--privileged=false`, on
    purpose (`blankCreateForm` has a test for it), but the Defaults subtitle
    says its values apply "here and in the terminal". Either the row says
    "terminal only", or the drawer starts from it, still behind the
    acknowledgement. A decision, not a bug. S

The two new card heads add more 10px `--tx-3` text; 1 and 3 fix that for all of
them.
