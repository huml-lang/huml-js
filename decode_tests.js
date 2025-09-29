import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';
import { parse } from './decode.js';

test('Assertions', async (t) => {
  const runAssertion = async (name, input, errorExpected) => {
    await t.test(name, () => {
      let failure = '';
      try {
        const result = parse(input);
        if (errorExpected) {
          failure = 'expected error but got none';
        }
      } catch (err) {
        if (!errorExpected) {
          failure = `unexpected error: ${err.message}`;
        }
      }
      if (failure !== '') {
        // This throws, so don't call it in the catch above.
        assert.fail(failure);
      }
    });
  };

  // Walk the ./tests/assertions directory
  const assertionsDir = './tests/assertions';
  const files = readdirSync(assertionsDir);

  for (const file of files) {
    const filePath = join(assertionsDir, file);
    const stats = statSync(filePath);

    // Skip directories and non-JSON files
    if (stats.isDirectory() || !file.endsWith('.json')) {
      continue;
    }

    // Read the JSON test file
    const data = readFileSync(filePath, 'utf8');
    const tests = JSON.parse(data);

    // Run each assertion
    for (let n = 0; n < tests.length; n++) {
      const testCase = tests[n];
      // +1 to account for the opening [ and the line break in the test file
      const testName = `line ${n + 1}: ${testCase.name}`;
      await runAssertion(testName, testCase.input, testCase.error);
    }
  }
});


test('Documents', async (t) => {
  // Read all files from tests/documents directory
  const dirPath = 'tests/documents';
  const dirEntries = readdirSync(dirPath);

  // Filter for .huml files
  const files = dirEntries
    .filter(file => file.endsWith('.huml'))
    .map(file => path.join(dirPath, file));

  if (files.length < 1) {
    throw new Error("expected at least 1 huml file in tests/documents");
  }

  for (const filePath of files) {
    await t.test(`testing ${path.basename(filePath)}`, () => {
      // Read .huml file and parse it.
      const humlContent = readFileSync(filePath, 'utf8');
      const resHuml = parse(humlContent);
      const normalizedHuml = normalizeToJSON(resHuml);

      // Read the corresponding JSON file.
      const jsonPath = filePath.replace('.huml', '.json');
      const jsonContent = readFileSync(jsonPath, 'utf8');
      const resJson = JSON.parse(jsonContent);

      // Deep-compare both.
      assert.deepEqual(normalizedHuml, resJson, `${path.basename(filePath)} and ${path.basename(jsonPath)} should be equal`);
    });
  }
});


// JSON lib uses number type for all numbers. Convert all numbers to the same type
// in the HUML-parsed structure to make a deep-comparison with the JSON structure possible.
function normalizeToJSON(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map(val => normalizeToJSON(val));
    } else {
      const result = {};
      for (const [key, val] of Object.entries(data)) {
        result[key] = normalizeToJSON(val);
      }
      return result;
    }
  }

  // Convert BigInt to number if needed
  if (typeof data === 'bigint') {
    return Number(data);
  }

  return data;
}
