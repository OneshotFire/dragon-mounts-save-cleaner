# Design

A compact game utility for removing Dragon Mounts from a character save. The user wants very little text and rejected the pale utility styling and invented angular dragon symbol.

## Current direction

- Palette: forest `#19221c`, panel `#222d25`, recess `#1c251f`, parchment `#e6e1d3`, muted sage `#adb7a9`, aged gold `#c5ad76`.
- Type: Iowan Old Style / Palatino for the Dragon Mounts wordmark, platform sans-serif for the form and results. No remote fonts.
- Artwork: the existing green dragon mount render from the mod, unchanged. Use a small portrait in the window header and the same native artwork as the favicon. Delete the invented SVG mark.
- Layout: one compact window, centered within a quiet forest background. Title and portrait form a single header, the file area sits beneath it, and results extend the same window. Left-aligned title, centered file action, full-width result rows. On mobile the window uses the available width and actions stack.

```text
        [native dragon] Dragon Mounts
                        Save cleaner
        --------------------------------
        Remove Dragon Mounts data…
        [ Drop character .json           ]
        [          Choose save           ]
        --------------------------------
        File / proposed removals
        Download cleaned save   Backup
```

The real dragon render is the visual identity; no invented crest, neon status pills, illustration generation, marketing hero, background gradient or animated decoration. Native game inventory panels inform the restrained gold borders and button treatment. Text and focus states stay readable, including on mobile. Keep the existing minimal wording and no source link. Exact IDs and paths remain in the downloadable report.

Design review: a black-and-gold landing page would add generic fantasy decoration to a simple tool. Use green-grey game panels, a modest serif wordmark and the actual mod artwork, with no large hero and no additional sections. The file action remains the primary focus.
