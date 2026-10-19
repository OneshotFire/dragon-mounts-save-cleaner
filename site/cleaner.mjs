// Exact identities used by Dragon Mounts 0.8.4 / 0.8.5 Preview 2.
// No name, substring, GUID-pattern or recursive deletion rules.
export const RULES_VERSION = '1.0.0';
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const IDS = Object.freeze({
  quests: Object.freeze(['zLmJN7Q25Ve1wh8GAQyksg', 'DB1maGITfFyJ7-CCXpPpdw']),
  mounts: Object.freeze(['Green', 'Blue', 'Red', 'Black'].map(c => `MountDataAsset:DA_Mount_${c}Dragon`)),
  items: Object.freeze(['q7DNSjuNtVyTc9xNDppcAg', 'culp9ybQ71ulE3-l8Cn-uw', 'g6e0BRXqbV-U81o15_AVyA', 'qpt2TkL8n1-RP6m29Wuo_w']),
  journals: Object.freeze(['QpWAH-x86Fu3HQ2AJMZJOg']),
  locations: Object.freeze(['Signs', 'Promise'].flatMap(q => ['Camp', 'Roost'].map(p => `Hannibus_${q}_${p}`))),
  actors: Object.freeze(['NPC', 'Landing', 'Scale', 'Remains', 'Approach'].map(a => `BP_Hannibus${a}_C`)),
});
const knownIds = new Set(Object.values(IDS).flat());
const questNames = new Map([[IDS.quests[0], 'Signs Beneath the Ash'], [IDS.quests[1], "A Rider’s Promise"]]);

export class SaveError extends Error {
  constructor(message) { super(message); this.name = 'SaveError'; }
}

// A strict JSON syntax tree with original source offsets. Numbers are never
// converted to JavaScript Number; every retained token keeps its original bytes.
export function parseJson(source) {
  if (typeof source !== 'string') throw new SaveError('Choose a UTF-8 character JSON file.');
  if (source.length > MAX_FILE_BYTES) throw new SaveError('This file is too large. Choose a character JSON file up to 16 MiB.');
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let nodes = 0;
  const fail = message => { throw new SaveError(`Invalid JSON near character ${i + 1}: ${message}. No file was changed.`); };
  const whitespace = () => { while (i < source.length && /[\t\r\n ]/.test(source[i])) i++; };
  function string() {
    const start = i++;
    while (i < source.length) {
      const c = source.charCodeAt(i++);
      if (c === 34) {
        const raw = source.slice(start, i);
        return { type: 'string', start, end: i, value: JSON.parse(raw) };
      }
      if (c < 32) fail('unescaped control character');
      if (c === 92) {
        const escape = source[i++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(i, i + 4))) fail('invalid Unicode escape');
          i += 4;
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) fail('invalid string escape');
      }
    }
    fail('unterminated string');
  }
  function value(depth) {
    if (depth > 128 || ++nodes > 500000) fail('file is too complex for this cleaner');
    whitespace();
    const start = i;
    const c = source[i];
    if (c === '"') return string();
    if (c === '{' || c === '[') {
      const object = c === '{';
      const close = object ? '}' : ']';
      const entries = [];
      const seen = new Set();
      i++; whitespace();
      if (source[i] !== close) {
        while (true) {
          whitespace();
          if (object) {
            if (source[i] !== '"') fail('expected a property name');
            const key = string();
            if (seen.has(key.value)) fail('duplicate property name');
            seen.add(key.value);
            whitespace();
            if (source[i++] !== ':') fail('expected a colon');
            const child = value(depth + 1);
            entries.push({ key: key.value, keyStart: key.start, keyEnd: key.end, start: key.start, end: child.end, value: child });
          } else entries.push(value(depth + 1));
          whitespace();
          if (source[i] === close) break;
          if (source[i++] !== ',') fail('expected a comma');
        }
      }
      i++;
      return { type: object ? 'object' : 'array', start, end: i, entries,
        ...(object ? { members: new Map(entries.map(e => [e.key, e.value])) } : {}) };
    }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, i)) {
        i += literal.length;
        return { type: literal === 'null' ? 'null' : 'boolean', start, end: i };
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(i));
    if (!number) fail('expected a value');
    i += number[0].length;
    return { type: 'number', start, end: i };
  }
  const root = value(0);
  whitespace();
  if (i !== source.length) fail('unexpected trailing data');
  return root;
}

const pointer = path => '/' + path.map(k => String(k).replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
function at(root, path) {
  let node = root;
  for (const key of path) {
    if (!node) return undefined;
    if (node.type !== 'object') throw new SaveError(`Unsupported save structure at ${pointer(path)}. No cleaned file was created.`);
    node = node.members.get(key);
  }
  return node;
}
function expect(node, type, path) {
  if (node && node.type !== type) throw new SaveError(`Unsupported ${pointer(path)}: expected ${type}. No cleaned file was created.`);
  return node;
}
function validateSave(root) {
  if (root.type !== 'object' || !at(root, ['GameProgress']) || !at(root, ['GameProgress', 'Character']) || !at(root, ['GameProgress', 'Inventory'])) {
    throw new SaveError('This is not a supported Dragonwilds character save. Choose its character .json, not a world or settings file.');
  }
  for (const path of [['GameProgress'], ['GameProgress', 'Character'], ['GameProgress', 'Inventory']]) expect(at(root, path), 'object', path);
}

// Independent structural verification against the original syntax tree. Deleted
// entries must be recorded actions; retained keys and scalar lexemes must match.
function verifyPreservation(before, after, source, cleaned, actions) {
  const allowed = new Map(actions.map(a => [a.path, a]));
  const mismatch = () => { throw new SaveError('Preservation verification failed. No cleaned file was created.'); };
  let unchangedValues = 0;
  function visit(a, b, path) {
    const action = allowed.get(pointer(path));
    if (action?.operation === 'replace') {
      if (cleaned.slice(b.start, b.end) !== action.replacement) mismatch();
      return;
    }
    if (a.type !== b.type) mismatch();
    if (a.type === 'object' || a.type === 'array') {
      const object = a.type === 'object';
      const kept = a.entries.map((entry, index) => ({ entry, key: object ? entry.key : index }))
        .filter(({ key }) => allowed.get(pointer([...path, key]))?.operation !== 'remove');
      if (kept.length !== b.entries.length) mismatch();
      kept.forEach(({ entry, key }, index) => {
        const other = b.entries[index];
        if (object) {
          if (entry.key !== other.key || source.slice(entry.keyStart, entry.keyEnd) !== cleaned.slice(other.keyStart, other.keyEnd)) mismatch();
          visit(entry.value, other.value, [...path, key]);
        } else visit(entry, other, [...path, key]);
      });
    } else {
      if (source.slice(a.start, a.end) !== cleaned.slice(b.start, b.end)) mismatch();
      unchangedValues++;
    }
  }
  visit(before, after, []);
  return unchangedValues;
}

function findRemaining(root) {
  const found = [];
  function visit(node, path) {
    if (node.type === 'string' && knownIds.has(node.value)) found.push(pointer(path));
    if (node.type === 'object') for (const entry of node.entries) {
      if (knownIds.has(entry.key)) found.push(pointer([...path, entry.key]));
      visit(entry.value, [...path, entry.key]);
    }
    if (node.type === 'array') node.entries.forEach((child, i) => visit(child, [...path, i]));
  }
  visit(root, []);
  return found;
}

export function cleanSave(source) {
  const root = parseJson(source);
  validateSave(root);
  const actions = [];
  const removals = new Map();
  const edits = [];
  const gp = ['GameProgress'];
  function remove(parent, index, path, id, category, label) {
    if (!removals.has(parent)) removals.set(parent, new Set());
    removals.get(parent).add(index);
    actions.push({ operation: 'remove', path: pointer(path), id, category, label });
  }
  function filter(path, ids, category, field) {
    const node = expect(at(root, path), 'array', path);
    if (!node) return;
    const matches = new Set(ids);
    node.entries.forEach((entry, index) => {
      const id = field ? expect(entry, 'object', [...path, index]).members.get(field) : entry;
      if (!id || id.type !== 'string') throw new SaveError(`Unsupported entry at ${pointer([...path, index])}. No cleaned file was created.`);
      if (matches.has(id.value)) remove(node, index, [...path, index], id.value, category, questNames.get(id.value) || id.value);
    });
  }
  function property(path, ids, category, replacement) {
    const node = at(root, path);
    if (!node) return;
    expect(node, 'string', path);
    if (!ids.includes(node.value)) return;
    if (replacement !== undefined) {
      actions.push({ operation: 'replace', path: pointer(path), id: node.value, category, label: 'Clear equipped dragon', replacement });
      edits.push({ start: node.start, end: node.end, replacement });
    } else {
      const parent = at(root, path.slice(0, -1));
      remove(parent, parent.entries.findIndex(e => e.key === path.at(-1)), path, node.value, category, 'Untrack Dragon Mounts quest');
    }
  }
  filter([...gp, 'QuestProgress', 'Quests'], IDS.quests, 'Quests', 'QuestId');
  filter([...gp, 'QuestProgress', 'QuestLocations'], IDS.locations, 'Quest locations', 'QuestLocationId');
  property([...gp, 'QuestProgress', 'QuestTracked'], IDS.quests, 'Tracked quest');
  filter([...gp, 'Character', 'Mount', 'MountsUnlockedList'], IDS.mounts, 'Dragon unlocks');
  // "None" is the same unequipped value used in the verified manual cleanup.
  property([...gp, 'Character', 'Mount', 'MountEquipped'], IDS.mounts, 'Equipped dragon', '"None"');
  for (const key of ['ItemsPickedUp', 'MilestoneMaterialsPickedUp']) filter([...gp, 'Progress', key], IDS.items, 'Item history');
  filter([...gp, 'Progress', 'ActorsInteractedWith'], IDS.actors, 'Interaction history');
  for (const key of ['UnlockedEntries', 'UnreadEntries']) filter([...gp, 'Journal', key], IDS.journals, 'Journal');
  for (const bag of ['Inventory', 'PersonalInventory', 'Loadout']) {
    const path = [...gp, bag];
    const node = expect(at(root, path), 'object', path);
    node?.entries.forEach((entry, index) => {
      const id = entry.value.type === 'object' ? entry.value.members.get('ItemData') : undefined;
      if (id?.type === 'string' && IDS.items.includes(id.value)) remove(node, index, [...path, entry.key], id.value, 'Custom items', `Dragon Mounts item in ${bag} slot ${entry.key}`);
    });
  }
  // Delete contiguous runs, including just the necessary adjacent comma.
  // Unselected values, object keys and their original slot indices are retained.
  for (const [parent, selected] of removals) {
    const entries = parent.entries;
    for (let first = 0; first < entries.length; first++) {
      if (!selected.has(first)) continue;
      let last = first;
      while (selected.has(last + 1)) last++;
      const start = last + 1 < entries.length || first === 0 ? entries[first].start : entries[first - 1].end;
      const end = last + 1 < entries.length ? entries[last + 1].start : entries[last].end;
      edits.push({ start, end, replacement: '' });
      first = last;
    }
  }
  edits.sort((a, b) => a.start - b.start);
  let cursor = 0;
  const chunks = [];
  for (const edit of edits) {
    if (edit.start < cursor || edit.end <= edit.start) throw new SaveError('Overlapping changes detected. No cleaned file was created.');
    chunks.push(source.slice(cursor, edit.start), edit.replacement);
    cursor = edit.end;
  }
  chunks.push(source.slice(cursor));
  const text = chunks.join('');
  const after = parseJson(text);
  const remaining = findRemaining(after);
  if (remaining.length) throw new SaveError(`Known Dragon Mounts data appears in an unsupported field (${remaining[0]}). Nothing was changed. This save needs individual review.`);
  const unchangedValues = verifyPreservation(root, after, source, text, actions);
  return { text, changes: actions, edits, verification: { validJson: true, onlyKnownEntriesChanged: true, unchangedValues, knownReferencesRemaining: 0 } };
}

export function decodeSave(bytes) {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new SaveError('Choose a character JSON file up to 16 MiB.');
  try {
    // ignoreBOM keeps an existing UTF-8 BOM in the returned source text.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { throw new SaveError('This file is not valid UTF-8. No file was changed.'); }
}
