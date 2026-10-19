import { cleanSave, decodeSave, MAX_FILE_BYTES, RULES_VERSION, SaveError } from './cleaner.mjs';

const $ = id => document.getElementById(id);
let generation = 0;
let current;
$('version').textContent = `v${RULES_VERSION}`;

function status(message, error = false) {
  $('status').textContent = message;
  $('status').className = error ? 'error' : '';
  $('status').hidden = !message;
}
function reset() {
  generation++;
  current = undefined;
  $('file-input').value = '';
  $('results').hidden = true;
  $('downloads').hidden = true;
  $('change-details').open = false;
  $('changes-list').replaceChildren();
  status('');
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function choose(files) {
  reset();
  const mine = generation;
  if (!files?.length) return;
  if (files.length !== 1) return status('Choose one character JSON file at a time. No file was changed.', true);
  const file = files[0];
  if (!/\.json$/i.test(file.name)) return status('Choose a character .json file. World .sav files are not supported.', true);
  if (file.size > MAX_FILE_BYTES) return status('Choose a character JSON file up to 16 MiB.', true);
  status('Checking your save locally…');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (mine !== generation) return;
    const source = decodeSave(bytes);
    const encoded = new TextEncoder().encode(source);
    if (bytes.length !== encoded.length || bytes.some((byte, i) => byte !== encoded[i])) throw new SaveError('The original encoding could not be preserved. No cleaned file was created.');
    const result = cleanSave(source);
    const output = new TextEncoder().encode(result.text);
    const [originalSHA256, cleanedSHA256] = await Promise.all([sha256(bytes), sha256(output)]);
    if (mine !== generation) return;
    const stem = file.name.replace(/\.json$/i, '').replace(/[\x00-\x1f/\\]/g, '_');
    const report = {
      tool: 'Dragon Mounts Save Cleaner', rulesVersion: RULES_VERSION,
      inputFile: file.name, originalSHA256, cleanedSHA256,
      ...result.verification, originalFileOverwritten: false,
      changes: result.changes, gameLoadTested: false,
    };
    current = { bytes, output, stem, report };
    $('file-name').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KiB`;
    const count = result.changes.length;
    $('results-title').textContent = count ? `${count} Dragon Mounts ${count === 1 ? 'entry' : 'entries'} found` : 'No known Dragon Mounts entries found';
    $('result-description').textContent = count
      ? 'Review the entries below. The cleaned copy removes these entries and clears an equipped dragon, if present.'
      : 'No changes are needed for the supported cleanup rules. Your file has been left exactly as it was.';
    $('verified').textContent = 'JSON validated. Every retained save value is unchanged.';
    $('change-details').hidden = !count;
    $('changes-summary').textContent = `Review all ${count} proposed changes`;
    const fragment = document.createDocumentFragment();
    for (const change of result.changes) {
      const li = document.createElement('li');
      const title = document.createElement('span');
      title.className = 'change-title';
      title.textContent = `${change.category}: ${change.label}`;
      const path = document.createElement('span');
      path.className = 'change-path'; path.textContent = change.path;
      const id = document.createElement('span');
      id.className = 'change-id'; id.textContent = change.id;
      li.append(title, path, id); fragment.append(li);
    }
    $('changes-list').replaceChildren(fragment);
    $('downloads').hidden = !count;
    $('results').hidden = false;
    status(count ? 'Save checked. A cleaned copy is ready to download.' : 'Save checked. No changes needed.');
  } catch (error) {
    if (mine !== generation) return;
    current = undefined;
    $('results').hidden = true;
    status(error instanceof SaveError ? error.message : 'This file could not be checked. No file was changed. Try a readable character JSON in a current browser.', true);
  }
}

$('choose-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => choose([...event.target.files]));
$('clear-file').addEventListener('click', () => { reset(); $('choose-file').focus(); });
$('download-cleaned').addEventListener('click', () => {
  if (current) download(current.output, `${current.stem}.cleaned.json`, 'application/json');
});
$('download-backup').addEventListener('click', () => {
  if (current) download(current.bytes, `${current.stem}.original.json`, 'application/json');
});
$('download-report').addEventListener('click', () => {
  if (current) download(JSON.stringify(current.report, null, 2) + '\n', `${current.stem}.cleanup-report.json`, 'application/json');
});
for (const event of ['dragover', 'drop']) document.addEventListener(event, e => {
  if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
});
$('drop-zone').addEventListener('dragover', event => {
  event.preventDefault(); $('drop-zone').classList.add('dragging');
});
$('drop-zone').addEventListener('dragleave', event => {
  if (!$('drop-zone').contains(event.relatedTarget)) $('drop-zone').classList.remove('dragging');
});
$('drop-zone').addEventListener('drop', event => {
  event.preventDefault(); $('drop-zone').classList.remove('dragging'); choose([...event.dataTransfer.files]);
});
