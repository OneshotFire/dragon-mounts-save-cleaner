import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSave, decodeSave, IDS, parseJson, SaveError, MAX_FILE_BYTES } from '../site/cleaner.mjs';

function fixture() {
  return {
    Version: 83, meta_data: { char_guid: '0123456789ABCDEF0123456789ABCDEF', char_name: 'Synthetic test' },
    SaveCount: 42, Customization: { Hair: 'native', Future: { unknown: true } }, Backup: 123456,
    GameProgress: {
      Character: { Health: { CurrentValue: 0.75 }, Mount: { MountEquipped: 'MountDataAsset:DA_Mount_Terrorbird', MountsUnlockedList: ['MountDataAsset:DA_Mount_Terrorbird'] } },
      Inventory: { '0': { GUID: 'native-unique', ItemData: 'native-ore', Count: 9 }, MaxSlotIndex: 27 },
      PersonalInventory: {}, Loadout: {}, Skills: { NativeSkill: { XP: 987.123 } },
      QuestProgress: { QuestTracked: 'native-quest', Quests: [{ QuestId: 'native-quest', State: 2, Future: 'keep' }], QuestLocations: [{ QuestLocationId: 'native-location', Position: [1, 2, 3] }] },
      Progress: { ItemsPickedUp: ['native-ore'], MilestoneMaterialsPickedUp: ['native-ore'], ActorsInteractedWith: ['native-NPC'], RecipesUnlocked: ['native-recipe'] },
      Journal: { UnlockedEntries: ['native-journal'], UnreadEntries: ['native-journal'] },
      FutureSection: { OtherMod: 'DA_Mount_GreenDragon_extended', Note: 'Hannibus, DragonMounts, dragon are ordinary text here.' },
    },
  };
}
function roundTrip(value, pretty = true) { return cleanSave(JSON.stringify(value, null, pretty ? '\t' : undefined)); }
function exactUneditedText(source, result) {
  let input = 0, output = 0;
  const restore = [];
  for (const edit of result.edits) {
    const unchanged = source.slice(input, edit.start);
    assert.equal(result.text.slice(output, output + unchanged.length), unchanged);
    output += unchanged.length;
    assert.equal(result.text.slice(output, output + edit.replacement.length), edit.replacement);
    restore.push({ start: output, end: output + edit.replacement.length, original: source.slice(edit.start, edit.end) });
    output += edit.replacement.length;
    input = edit.end;
  }
  assert.equal(result.text.slice(output), source.slice(input));
  let restored = result.text;
  for (const edit of restore.reverse()) restored = restored.slice(0, edit.start) + edit.original + restored.slice(edit.end);
  assert.equal(restored, source);
}

test('an unmodded save is returned byte for byte, with no proposed changes', () => {
  const input = JSON.stringify(fixture(), null, '\t') + '\n';
  const result = cleanSave(input);
  assert.equal(result.text, input); assert.deepEqual(result.changes, []);
});

test('only the two custom quests, matching tracker and locations are removed', () => {
  const before = fixture();
  const value = structuredClone(before);
  const q = value.GameProgress.QuestProgress;
  q.Quests.unshift({ QuestId: IDS.quests[0], NativeDependency: 'native-quest' });
  q.Quests.push({ QuestId: IDS.quests[1], State: 1 });
  q.QuestTracked = IDS.quests[0];
  q.QuestLocations.push(...IDS.locations.map(QuestLocationId => ({ QuestLocationId, NativeFields: [1, 2] })));
  const result = roundTrip(value);
  const expected = structuredClone(before); delete expected.GameProgress.QuestProgress.QuestTracked;
  assert.deepEqual(JSON.parse(result.text), expected);
  assert.equal(result.changes.length, 7);
});

test('all four custom dragons are removed while native mounts and their order remain', () => {
  const before = fixture(); const value = structuredClone(before);
  value.GameProgress.Character.Mount.MountsUnlockedList.push(...IDS.mounts);
  value.GameProgress.Character.Mount.MountEquipped = IDS.mounts[3];
  const result = roundTrip(value);
  const expected = structuredClone(before); expected.GameProgress.Character.Mount.MountEquipped = 'None';
  assert.deepEqual(JSON.parse(result.text), expected); assert.equal(result.changes.length, 5);
});

test('a native equipped mount and unrelated tracker stay unchanged', () => {
  const value = fixture(); const mount = value.GameProgress.Character.Mount;
  mount.MountsUnlockedList.push(IDS.mounts[0]);
  const result = JSON.parse(roundTrip(value).text);
  assert.equal(result.GameProgress.Character.Mount.MountEquipped, mount.MountEquipped);
  assert.equal(result.GameProgress.QuestProgress.QuestTracked, 'native-quest');
});

test('custom items in all three bags are removed without shifting slots or changing other items', () => {
  const before = fixture(); const value = structuredClone(before);
  for (const bag of ['Inventory', 'PersonalInventory', 'Loadout']) {
    value.GameProgress[bag]['1'] = { GUID: 'owned-item', ItemData: IDS.items[0], Count: 1, Other: 99 };
    value.GameProgress[bag]['7'] = { GUID: 'keep-guid', ItemData: 'other-mod-item', Durability: 700 };
    value.GameProgress[bag]['8'] = { GUID: 'other-owned-item', ItemData: IDS.items[3] };
    before.GameProgress[bag]['7'] = structuredClone(value.GameProgress[bag]['7']);
  }
  assert.deepEqual(JSON.parse(roundTrip(value).text), before);
});

test('history and journal cleanup leaves recipes, skills, native records and other mods untouched', () => {
  const before = fixture(); const value = structuredClone(before);
  for (const key of ['ItemsPickedUp', 'MilestoneMaterialsPickedUp']) value.GameProgress.Progress[key].push(...IDS.items);
  value.GameProgress.Progress.ActorsInteractedWith.push(...IDS.actors);
  for (const key of ['UnlockedEntries', 'UnreadEntries']) value.GameProgress.Journal[key].unshift(...IDS.journals);
  assert.deepEqual(JSON.parse(roundTrip(value).text), before);
});

test('cleanup is idempotent', () => {
  const value = fixture(); value.GameProgress.Progress.ItemsPickedUp.push(...IDS.items);
  const first = roundTrip(value); const second = cleanSave(first.text);
  assert.equal(second.text, first.text); assert.equal(second.changes.length, 0);
});

test('all removal positions and adjacent runs preserve valid JSON and retained source text', () => {
  for (let length = 1; length <= 8; length++) for (let mask = 0; mask < 2 ** length; mask++) {
    const value = fixture();
    const list = Array.from({ length }, (_, i) => mask & (1 << i) ? IDS.mounts[i % 4] : `native-mount-${i}`);
    value.GameProgress.Character.Mount.MountsUnlockedList = list;
    const source = JSON.stringify(value, null, mask % 2 ? '  ' : undefined);
    const result = cleanSave(source);
    assert.deepEqual(JSON.parse(result.text).GameProgress.Character.Mount.MountsUnlockedList, list.filter(id => !IDS.mounts.includes(id)));
    exactUneditedText(source, result);
  }
});

test('object member deletion handles first, middle, last and all members', () => {
  for (let mask = 0; mask < 32; mask++) {
    const value = fixture(); const bag = {}; const expected = {};
    for (let i = 0; i < 5; i++) {
      bag[`slot${i}`] = { ItemData: mask & (1 << i) ? IDS.items[i % 4] : `native-${i}`, GUID: `guid-${i}` };
      if (!(mask & (1 << i))) expected[`slot${i}`] = bag[`slot${i}`];
    }
    value.GameProgress.Inventory = bag;
    const source = JSON.stringify(value, null, 2); const result = cleanSave(source);
    assert.deepEqual(JSON.parse(result.text).GameProgress.Inventory, expected);
    exactUneditedText(source, result);
  }
});

test('numbers beyond JS precision, exponent spelling, negative zero and Unicode escapes remain exact', () => {
  const value = fixture(); value.GameProgress.Progress.ItemsPickedUp.push(IDS.items[0]);
  const source = JSON.stringify(value).replace('"SaveCount":42', '"SaveCount":900719925474099312345678901234567890,"future":-0,"float":1.23000e+03,"word":"\\u0041\\u00e9"');
  const result = cleanSave(source);
  assert.ok(result.text.includes('900719925474099312345678901234567890'));
  assert.ok(result.text.includes('"future":-0,"float":1.23000e+03,"word":"\\u0041\\u00e9"'));
  exactUneditedText(source, result);
});

test('UTF-8 BOM, CRLF, non-ASCII text and trailing whitespace are preserved', () => {
  const value = fixture(); value.meta_data.char_name = 'ドラゴン 🐉 é'; value.GameProgress.Progress.ItemsPickedUp.push(...IDS.items);
  const source = '\ufeff' + JSON.stringify(value, null, '\t').replaceAll('\n', '\r\n') + '\r\n  ';
  const bytes = new TextEncoder().encode(source); assert.equal(decodeSave(bytes), source);
  const result = cleanSave(decodeSave(bytes));
  assert.ok(result.text.startsWith('\ufeff')); assert.ok(result.text.endsWith('\r\n  '));
  assert.ok(result.text.includes('ドラゴン 🐉 é')); exactUneditedText(source, result);
});

test('escaped identities are matched by decoded exact value', () => {
  const value = fixture(); value.GameProgress.Progress.ItemsPickedUp.push(IDS.items[0]);
  const source = JSON.stringify(value).replace(IDS.items[0], '\\u0071' + IDS.items[0].slice(1));
  assert.equal(cleanSave(source).changes.length, 1);
});

test('missing optional sections are accepted and preserved', () => {
  const value = { Version: 83, GameProgress: { Character: {}, Inventory: {} } };
  const source = JSON.stringify(value); assert.equal(cleanSave(source).text, source);
});

test('exact IDs in an unsupported section cause refusal rather than broad deletion', () => {
  const value = fixture(); value.GameProgress.FutureSection.KeepThis = IDS.items[0];
  assert.throws(() => roundTrip(value), /unsupported field/);
});

test('unknown journal fields containing an owned ID require individual review', () => {
  const value = fixture(); value.GameProgress.Journal.FutureList = [...IDS.journals];
  assert.throws(() => roundTrip(value), /unsupported field/);
});

test('owned IDs used as unexpected property names also cause refusal', () => {
  const value = fixture(); value.GameProgress.FutureSection[IDS.mounts[0]] = 'keep';
  assert.throws(() => roundTrip(value), /unsupported field/);
});

test('names, GUIDs and ID prefixes do not trigger heuristic deletion', () => {
  const value = fixture(); value.meta_data.char_name = 'Hannibus DragonMounts';
  value.GameProgress.Inventory['8'] = { ItemData: IDS.items[0] + '-another-mod', GUID: 'native-guid', PersistenceID: 'native-persistence-id' };
  value.GameProgress.Progress.ItemsPickedUp.push('prefix-' + IDS.items[0]);
  const source = JSON.stringify(value); assert.equal(cleanSave(source).text, source);
});

test('prototype-looking property names are data, and do not pollute objects', () => {
  const value = fixture(); const source = JSON.stringify(value).replace('"Backup":123456', '"Backup":123456,"__proto__":{"polluted":true},"constructor":{"prototype":{}}');
  assert.equal(cleanSave(source).text, source); assert.equal({}.polluted, undefined);
});

test('a changed schema at a supported path fails closed', () => {
  for (const wrong of [{}, null, 5, 'text']) {
    const value = fixture(); value.GameProgress.QuestProgress.Quests = wrong;
    assert.throws(() => roundTrip(value), SaveError);
  }
  const value = fixture(); value.GameProgress.QuestProgress.Quests.push({ UnexpectedId: IDS.quests[0] });
  assert.throws(() => roundTrip(value), SaveError);
});

test('malformed and ambiguous JSON is rejected without output', () => {
  const invalid = ['', '{', '[1,]', '{"a":1,}', '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":NaN}', '{"a":Infinity}', '{"a":01}', '{"a":.1}', '{"a":1.}', '{"a":+1}', '{"a":true} false', '{"a":"\\x20"}', '{"a":"\\u123"}', '{"a":"line\nbreak"}', '{/* comment */}', '\ufeff\ufeff{}'];
  for (const source of invalid) assert.throws(() => parseJson(source), SaveError, source);
});

test('worlds, settings and arbitrary JSON files are refused', () => {
  for (const value of [null, [], {}, { GameProgress: {} }, { GameProgress: { Character: null, Inventory: {} } }, { GameProgress: { Character: {}, Inventory: [] } }]) {
    assert.throws(() => cleanSave(JSON.stringify(value)), SaveError);
  }
});

test('invalid UTF-8, oversized input and excessive nesting are refused', () => {
  assert.throws(() => decodeSave(new Uint8Array([0xc3, 0x28])), SaveError);
  assert.throws(() => decodeSave(new Uint8Array(MAX_FILE_BYTES + 1)), SaveError);
  assert.throws(() => parseJson('['.repeat(130) + '0' + ']'.repeat(130)), SaveError);
});
