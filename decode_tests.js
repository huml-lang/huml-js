import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './huml.js';

test('Assertions', async (t) => {
  const runAssertion = async (name, input, errorExpected) => {
    await t.test(name, () => {
      try {
        const result = parse(input);
        if (errorExpected) {
          assert.fail('expected error but got none');
        }
      } catch (err) {
        if (!errorExpected) {
          assert.fail(`unexpected error: ${err.message}`);
        }
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
