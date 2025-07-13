import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { stringify } from './encode.js';
import huml from './huml.js';


test('TestEncodeDoc', () => {
    // Read source data as HUML.
    const humlContent = readFileSync('tests/documents/mixed.huml', 'utf8');
    const resHuml = huml.parse(humlContent);

    // Marshal it back to HUML.
    const marshalled = stringify(resHuml);


    // Read it again using the HUML parser.
    const resHumlConverted = huml.parse(marshalled);
    const out = normalizeToJSON(resHumlConverted);

    // Read test.json and parse it.
    const jsonContent = readFileSync('tests/documents/mixed.json', 'utf8');
    const resJson = JSON.parse(jsonContent);

    // Deep compare both.
    assert.deepEqual(out, resJson, 'mixed.huml and mixed.json should be deeply equal');
});

function normalizeToJSON(obj) {
    if (obj === null || obj === undefined) return null;

    if (typeof obj === 'number') {
        if (Number.isNaN(obj)) return null;
        if (obj === Infinity) return null;
        if (obj === -Infinity) return null;
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(normalizeToJSON);
    }

    if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = normalizeToJSON(value);
        }
        return result;
    }

    return obj;
}
