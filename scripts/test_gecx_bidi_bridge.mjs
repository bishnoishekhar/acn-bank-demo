// Offline test of the voice bridge in src/components/gecxBidi.js.
// Replays what the SDK really does for live voice (chat-messenger.js, bidi TEXT handler):
//   first text chunk of a turn -> addUtterance({utteranceId, text})
//   later chunks, same turn    -> updateUtterance({utteranceId, text: CUMULATIVE text})
// Run: node scripts/test_gecx_bidi_bridge.mjs

import assert from 'node:assert/strict';

let consumer = null;
const button = { click() {} };
const messenger = {
  querySelector: (sel) => (sel === 'button.microphone' ? button : null),
  setAttribute() {},
  addEventListener() {},
  registerMessageConsumer(c) { consumer = c; },
  presenter: {},
};
globalThis.window = { chatSdk: { getContext: () => ({ state: { accessToken: 'x' } }) } };
globalThis.document = { querySelector: (sel) => (sel === 'chat-messenger' ? messenger : null) };

// gecxBidi.js imports './gecx' without an extension (fine for Vite, not for plain Node) and calls applyCesVariables():
// load a copy with that one import stubbed out, so the test only exercises the bridge itself.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const bridgeSrc = readFileSync(new URL('../src/components/gecxBidi.js', import.meta.url), 'utf8')
  .replace(/import\s*\{\s*applyCesVariables\s*\}\s*from\s*['"]\.\/gecx['"];?/, 'const applyCesVariables = () => {};');
const bridgeFile = join(mkdtempSync(join(tmpdir(), 'gecxbidi-')), 'gecxBidi.mjs');
writeFileSync(bridgeFile, bridgeSrc);
const bridge = await import(pathToFileURL(bridgeFile).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let out = [];
const reset = async () => {
  bridge.resetBidiBridge();
  consumer = null;
  out = [];
  bridge.setBidiHandlers({ onOutputs: (o) => out.push(...o) });
  await bridge.connectBidi();
  assert.ok(consumer, 'consumer registered');
};
const add = (id, text, isBot = true) => consumer.addMessages([{ utteranceId: id, messages: [{ type: 'text', text }], isBot }]);
const upd = (id, text) => consumer.updateMessages([{ utteranceId: id, messages: [{ type: 'text', text }], isBot: true }]);
const texts = () => out.filter((o) => o.text).map((o) => o.text);

let n = 0;
const test = async (name, fn) => { await reset(); await fn(); n += 1; console.log('PASS', name); };

await test('first chunk shown immediately when it ends a sentence', async () => {
  add('u1', 'Verifying your PIN now.');
  assert.deepEqual(texts(), ['Verifying your PIN now.']);
});

await test('REGRESSION: text spoken after a tool call (update on the same utterance) is shown', async () => {
  add('u1', 'Verifying your PIN now.');
  await sleep(50);
  // 2.6 s hub call later the SDK appends the next message to the same utterance, cumulative text
  upd('u1', 'Verifying your PIN now.By proceeding, you consent to a credit bureau inquiry. Do you consent?');
  assert.equal(texts().length, 1, 'not forwarded word by word, waits for the stream to settle');
  await sleep(750);
  assert.deepEqual(texts(), ['Verifying your PIN now.', 'By proceeding, you consent to a credit bureau inquiry. Do you consent?']);
});

await test('word-by-word streaming becomes ONE bubble, not one per word', async () => {
  add('u2', 'To verify');
  upd('u2', 'To verify it');
  upd('u2', "To verify it's you,");
  upd('u2', "To verify it's you, please type your 4-digit PIN.");
  assert.equal(texts().length, 0, 'mid-sentence first chunk is held');
  await sleep(750);
  assert.deepEqual(texts(), ["To verify it's you, please type your 4-digit PIN."]);
});

await test('several updates in one burst produce a single extra bubble', async () => {
  add('u3', 'One moment while I pull up your account.');
  upd('u3', 'One moment while I pull up your account.To verify');
  upd('u3', "One moment while I pull up your account.To verify it's you, enter your PIN.");
  await sleep(750);
  assert.deepEqual(texts(), ['One moment while I pull up your account.', "To verify it's you, enter your PIN."]);
});

await test('a repeated add for the same utterance is not drawn twice', async () => {
  add('u4', 'Hello there.');
  add('u4', 'Hello there.');
  assert.deepEqual(texts(), ['Hello there.']);
});

await test('an update for an utterance the bridge never saw is treated as new', async () => {
  upd('u5', 'Late arrival.');
  assert.deepEqual(texts(), ['Late arrival.']);
});

await test('an update that rewrites (is not an extension) is ignored, never duplicated', async () => {
  add('u6', 'Your balance is ready.');
  upd('u6', 'Completely different words.');
  await sleep(750);
  assert.deepEqual(texts(), ['Your balance is ready.']);
});

await test('unchanged update does nothing', async () => {
  add('u7', 'All set.');
  upd('u7', 'All set.');
  await sleep(750);
  assert.deepEqual(texts(), ['All set.']);
});

await test('each forwarded piece gets its own turnIndex (ChatPanel dedupes on it)', async () => {
  add('u8', 'First.');
  upd('u8', 'First.Second.');
  await sleep(750);
  const idx = out.map((o) => o.turnIndex);
  assert.equal(new Set(idx).size, idx.length);
});

await test('customer speech (isBot=false) still goes through the user-transcript path, not outputs', async () => {
  let said = null;
  bridge.setBidiHandlers({ onUserTranscript: (t) => { said = t; } });
  add('c1', 'two two four four', false);
  assert.equal(said, 'two two four four');
  assert.deepEqual(texts(), []);
});

await test('nothing is forwarded when the voice session is not open', async () => {
  await bridge.disconnectBidi();
  add('z1', 'Should not appear.');
  upd('z1', 'Should not appear.Nor this.');
  await sleep(750);
  assert.deepEqual(texts(), []);
});

await test('reset clears pending timers (no late output after remount)', async () => {
  add('t1', 'Streaming');
  bridge.resetBidiBridge();
  await sleep(750);
  assert.deepEqual(texts(), []);
});

console.log(`\nALL ${n} PASSED`);
process.exit(0);
