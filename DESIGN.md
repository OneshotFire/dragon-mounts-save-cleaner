# Design

A small, single-purpose utility for players removing Dragon Mounts from a character save.

- Colours: slate blue `#162b38`, ink `#243743`, mist `#edf3f5`, white `#ffffff`, brass `#8b632b`, and deep green `#25634d`.
- Type: Georgia for the Dragon Mounts title, the platform system sans-serif for controls and explanations. No remote font requests.
- Layout: a narrow, left-aligned workbench. A small dragon-wing mark and title lead directly to file selection; the results replace the empty instruction area beneath it. The file and findings belong to one continuous panel. Downloads appear only after validation succeeds.

```text
  Dragon Mounts / Save cleaner             Browser only
  Remove Dragon Mounts data from your character save.

  [ Drop character .json here / Choose save ]
  [ File name                              ]
  [ Summary and exact proposed removals     ]
  [ Download cleaned copy ] Backup | Report

  How to use your cleaned copy
```

The save and the findings are the visual focus. Avoid a marketing hero, screenshots, stat cards, decorative animation, or extra navigation. A calm blue and white tool with restrained brass accents fits a repair task better than a dark fantasy landing page. The dragon reference stays in the title and a simple line mark. On mobile, actions wrap into full-width controls. Native focus states, sufficient contrast, keyboard file selection and a live status message are required.

User revision: keep the page to file selection, compact grouped findings and downloads. Remove the instructions section, save-folder help and wrapper references. Keep raw IDs and JSON paths in the downloadable report. The only installation hint is the original filename reminder next to the download.
