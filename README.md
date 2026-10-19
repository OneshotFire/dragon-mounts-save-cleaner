# Dragon Mounts Save Cleaner

A small, browser-only tool for removing known Dragon Mounts data from Dragonwilds **character JSON saves**. Intended for players uninstalling the mod or cleaning known mod leftovers.

The page is static HTML, CSS and JavaScript. There are no dependencies, accounts, save uploads, analytics, external fonts, or runtime API calls. Files stay in browser memory. Downloads use a new filename; the original cannot be overwritten by this tool.

## Use

1. Close the game and keep an original backup outside `SaveCharacters`.
2. Choose the affected character `.json` and review every proposed change.
3. Download the cleaned copy. To install it yourself, replace the affected save using its original filename.

World `.sav` files are unsupported.

Cleaning removes Dragon Mounts quest progress, dragon unlocks, custom items and associated records. It cannot reconstruct missing or truncated data, and is not an automatic multiplayer compatibility layer. A successful JSON check does not prove that a particular file will load in-game.

## Exact cleanup scope

The allowlist in [`site/cleaner.mjs`](site/cleaner.mjs) uses the verified identities from the original manual cleanup and the existing Dragon Mounts compatibility investigation. Rules target the 0.8.4 identities, also used by 0.8.5 Preview 2:

| Save path under `GameProgress` | Action |
| --- | --- |
| `QuestProgress.Quests` | Remove only records with either of the two custom `QuestId` values. |
| `QuestProgress.QuestTracked` | Remove the property only if it tracks either custom quest. |
| `QuestProgress.QuestLocations` | Remove only the four Hannibus camp/roost marker records. |
| `Character.Mount.MountsUnlockedList` | Remove the four exact custom dragon asset IDs. |
| `Character.Mount.MountEquipped` | Set to `"None"` only if a custom dragon is equipped, matching the original manual cleanup. |
| `Progress.ItemsPickedUp`, `Progress.MilestoneMaterialsPickedUp` | Remove the four exact custom item IDs. |
| `Progress.ActorsInteractedWith` | Remove the five exact Hannibus actor IDs. |
| `Journal.UnlockedEntries`, `Journal.UnreadEntries` | Remove only the custom Hannibus journal ID. |
| `Inventory`, `PersonalInventory`, `Loadout` | Remove only slots whose `ItemData` is one of the four custom item IDs. Retained slots keep their original keys. |

There is no recursive deletion, fuzzy matching, GUID replacement, substring deletion, save version migration, or rewriting of unknown data. A known custom ID in an unsupported field blocks the cleaned download for individual review.

## Preservation

A strict JSON parser retains source offsets. The cleaner removes selected source ranges and replaces only a known equipped dragon value. It never parses save numbers as JavaScript `Number` or serializes the whole save. Retained numeric spelling, large integers, Unicode escapes, key order, original UTF-8 BOM and line endings remain as written. Only removed entries and their necessary commas/adjacent whitespace change.

The output is parsed again and compared structurally against the original with only the recorded changes allowed. Duplicate keys, malformed JSON, unsupported shapes, invalid UTF-8, excessive nesting and files over 16 MiB are refused. The download report includes original/output SHA-256 hashes and every proposed change, without embedding the save's inventory or personal data.

## Development and tests

Requires Node.js 22 or newer for tests. No package installation or build step.

```sh
npm test
npm run preview
```

Visit `http://127.0.0.1:4173`. The static site lives entirely in `site/`; paths work beneath a GitHub Pages project subdirectory.

Synthetic public tests cover precise removal, native/unknown data preservation, inventories without slot shifting, large numeric values, encoding, malformed/ambiguous inputs, unknown schema refusal, idempotence, and every removal pattern in arrays up to eight entries.

A separate local script compares a supplied private character save against a previously cleaned reference, proves all unedited text is identical, reverses the changes back to the exact original and checks the source file remains untouched:

```sh
node scripts/check-save.mjs /path/to/original.json /path/to/reference.json /outside/repository/private-results
```

**Never commit real player saves, downloaded copies or personal test artifacts.** All public tests use generated fixtures. The real-file check writes only outside this repository.

## GitHub Pages

Enable Pages with **GitHub Actions** as the publishing source. The workflow tests the source and uploads only `site/` to Pages; the local scripts, tests and any unrelated files are excluded from the website artifact. No server or secrets are required.

This utility is separate from the Dragon Mounts mod and the save migration experiment.
