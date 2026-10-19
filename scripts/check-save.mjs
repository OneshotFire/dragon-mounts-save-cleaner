// Local-only check. Never copy a real player save into this repository.
// node scripts/check-save.mjs INPUT.json EXPECTED_CLEANED.json PRIVATE_OUTPUT_DIR
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cleanSave, decodeSave, RULES_VERSION } from '../site/cleaner.mjs';

const [inputPath, expectedPath, outputDir] = process.argv.slice(2);
if (!inputPath || !expectedPath || !outputDir) throw new Error('Provide input, previously cleaned reference, and a private output directory outside the repository.');
const repository = path.resolve(import.meta.dirname, '..');
const destination = path.resolve(outputDir);
if (destination === repository || destination.startsWith(repository + path.sep)) throw new Error('Keep real player files outside the public source repository.');
const hash = data => createHash('sha256').update(data).digest('hex');
const originalBytes = await readFile(inputPath);
const originalSHA256 = hash(originalBytes);
const source = decodeSave(originalBytes);
const result = cleanSave(source);
const before = JSON.parse(source.replace(/^\ufeff/, ''));
const after = JSON.parse(result.text.replace(/^\ufeff/, ''));
const reference = JSON.parse(await readFile(expectedPath, 'utf8'));
assert.deepEqual(after, reference, 'New cleaner must match the previously recorded cleanup exactly.');
for (const key of Object.keys(before)) if (key !== 'GameProgress') assert.deepEqual(after[key], before[key], key);
for (const key of ['Inventory', 'PersonalInventory', 'Loadout', 'Skills', 'Spellcasting', 'RevealedLandmarks', 'RevealedFog', 'MapCustomization']) assert.deepEqual(after.GameProgress[key], before.GameProgress[key], key);
const second = cleanSave(result.text);
assert.equal(second.text, result.text); assert.equal(second.changes.length, 0);
let cursor = 0, outputCursor = 0, untouchedCharacters = 0;
const reverse = [];
for (const edit of result.edits) {
  const chunk = source.slice(cursor, edit.start);
  assert.equal(result.text.slice(outputCursor, outputCursor + chunk.length), chunk);
  untouchedCharacters += chunk.length;
  outputCursor += chunk.length;
  reverse.push({ start: outputCursor, end: outputCursor + edit.replacement.length, text: source.slice(edit.start, edit.end) });
  outputCursor += edit.replacement.length;
  cursor = edit.end;
}
assert.equal(result.text.slice(outputCursor), source.slice(cursor));
untouchedCharacters += source.slice(cursor).length;
let restored = result.text;
for (const edit of reverse.reverse()) restored = restored.slice(0, edit.start) + edit.text + restored.slice(edit.end);
assert.equal(restored, source);
assert.equal(hash(await readFile(inputPath)), originalSHA256);
const categories = {};
for (const change of result.changes) categories[change.category] = (categories[change.category] || 0) + 1;
const report = {
  status: 'PASS', rulesVersion: RULES_VERSION, originalSHA256,
  cleanedSHA256: hash(Buffer.from(result.text)), sourceUnchanged: true,
  semanticMatchToPreviousCleanup: true, ...result.verification,
  everyUneditedTextRangeIdentical: true, reversingEditsRestoresOriginalExactly: true,
  untouchedCharacters, idempotent: true,
  inventoryEquipmentSkillsAndOtherProgressUnchanged: true,
  nativeMountsPreserved: after.GameProgress.Character.Mount.MountsUnlockedList.length,
  nativeQuestsPreserved: after.GameProgress.QuestProgress.Quests.length,
  changesCount: result.changes.length, categories,
  gameLoadTested: false,
};
await mkdir(destination, { recursive: true });
const stem = path.basename(inputPath).replace(/\.json$/i, '');
await writeFile(path.join(destination, `${stem}.cleaned.json`), result.text, { flag: 'wx' });
await writeFile(path.join(destination, 'save-test-report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
