// Regular expression to validate bare keys (no quotes needed).
const BARE_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

const CFG = {
  // Include the version header?
  includeVersion: false,
};

// Encde a value to HUML format.
function toValue(value, indent, lines, isRootLevel = false) {
  if (value === null || value === undefined) {
    lines[lines.length - 1] += 'null';
    return;
  }

  const type = typeof value;
  
  if (type === 'boolean') {
    lines[lines.length - 1] += String(value);
  } else if (type === 'number') {
    lines[lines.length - 1] += formatNumber(value);
  } else if (type === 'string') {
    toString(value, indent, lines);
  } else if (Array.isArray(value)) {
    toArray(value, indent, lines, isRootLevel);
  } else if (type === 'object') {
    toObject(value, indent, lines, isRootLevel);
  } else {
    throw new Error(`Unsupported type: ${type}`);
  }
}

// Format a number for HUML output.
function formatNumber(num) {
  if (Number.isNaN(num)) return 'nan';
  if (num === Infinity) return 'inf';
  if (num === -Infinity) return '-inf';

  return String(num);
}

// Encode a string value.
function toString(str, indent, lines) {
  if (str.includes('\n')) {
    // Multi-line string.
    const keyIndent = indent - 2;
    const contentIndent = indent;
    
    lines[lines.length - 1] += '```';
    const strLines = str.split('\n');
    
    // Remove empty last line if string ends with newline.
    if (strLines[strLines.length - 1] === '') {
      strLines.pop();
    }
    
    strLines.forEach(line => {
      lines.push(' '.repeat(contentIndent) + line);
    });
    
    lines.push(' '.repeat(keyIndent) + '```');
  } else {
    // Single-line string - use JSON.stringify for proper escaping.
    lines[lines.length - 1] += JSON.stringify(str);
  }
}

// Encode an array value.
function toArray(arr, indent, lines, isRootLevel = false) {
  if (arr.length === 0) {
    lines[lines.length - 1] += '[]';
    return;
  }

  // For root level arrays, don't add extra indentation.
  const itemIndent = isRootLevel ? 0 : indent;

  arr.forEach((item, i) => {
    lines.push(' '.repeat(itemIndent) + '- ');
    
    if (isVector(item)) {
      lines[lines.length - 1] += '::';
      toValue(item, itemIndent + 2, lines);
    } else {
      toValue(item, itemIndent, lines);
    }
  });
}

// Encode an object value.
function toObject(obj, indent, lines, isRootLevel = false) {
  const entries = Object.entries(obj);
  
  if (entries.length === 0) {
    lines[lines.length - 1] += '{}';
    return;
  }

  // Sort keys for deterministic output.
  entries.sort(([a], [b]) => a.localeCompare(b));

  // For root level objects, don't add extra indentation.
  const keyIndent = isRootLevel ? 0 : indent;

  entries.forEach(([key, value], i) => {
    writeKeyValuePair(key, value, keyIndent, lines);
  });
}

// Writes a key-value pair.
function writeKeyValuePair(key, value, indent, lines) {
  lines.push(' '.repeat(indent) + quoteKey(key));
  
  const isVec = isVector(value);
  const isEmpty = isEmptyVector(value);
  
  if (isVec) {
    lines[lines.length - 1] += isEmpty ? ':: ' : '::';
  } else {
    lines[lines.length - 1] += ': ';
  }
  
  toValue(value, indent + 2, lines);
}

// Determines if a value is a vector (array or object).
function isVector(value) {
  return value !== null && 
         (Array.isArray(value) || 
          (typeof value === 'object' && value.constructor === Object));
}

// Determines if a vector is empty.
function isEmptyVector(value) {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length === 0;
  }
  return false;
}

// Quotes a key if necessary.
function quoteKey(key) {
  return BARE_KEY_REGEX.test(key) ? key : JSON.stringify(key);
}

// Convert a JS object to HUML format.
export function stringify(obj, cfg) {
  const lines = [];
  
  if (cfg && cfg.includeVersion) {
    lines.push('%HUML v0.1.0');
    lines.push('');
  }
  
  toValue(obj, 0, lines, true);
  lines.push(''); // Ensure document ends with newline.

  return lines.join('\n');
}
