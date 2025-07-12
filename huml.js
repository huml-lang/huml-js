/**
 * This package provides a parser for HUML (Human Markup Language),
 * a strict, human-readable data format.
 * 
 * HUML (Human Markup Language) enforces:
 * - Strict indentation (2 spaces)
 * - No trailing spaces
 * - Explicit type indicators (: for scalar, :: for vector)
 * - Clear multiline string delimiters (``` preserves spacing, """ strips)
 * - ALL strings must be quoted with double quotes
 * 
 * Key HUML concepts:
 * - [] and {} are ONLY for empty collections
 * - Inline lists: key:: "val1", "val2", 3, true (NO brackets)
 * - Inline dicts: key:: k1: "v1", k2: 2 (NO braces)
 * - Strings are ALWAYS quoted: "value"
 * - Numbers, booleans, null are unquoted: 123, true, null
 */

const TYPES = Object.freeze({
    INLINE_DICT: 1,
    MULTILINE_DICT: 2,
    EMPTY_LIST: 3,
    EMPTY_DICT: 4,
    MULTILINE_LIST: 5,
    INLINE_LIST: 6,
    SCALAR: 7
});

// Unquoted values: booleans, null, special numbers.
const SPECIAL_VALUES = [
    ['true', true],
    ['false', false],
    ['null', null],
    ['nan', NaN],
    ['inf', Infinity]
];

const ESCAPE_MAP = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    'n': '\n',
    't': '\t',
    'r': '\r',
    'b': '\b',
    'f': '\f'
};

const NUMBER_BASE_PREFIXES = [
    ['0x', 16],
    ['0o', 8],
    ['0b', 2]
];

class ParseError extends Error {
    constructor(message, line) {
        super(`line ${line}: ${message}`);
        this.name = 'HUMLError';
        this.line = line;
    }
}

class Parser {
    constructor(data) {
        this.data = data;
        this.pos = 0;
        this.line = 1;
    }

    // Main parse entry point - handles version declaration and determines root type.
    parse() {
        if (this.data.length === 0) {
            throw new Error('empty document is undefined');
        }

        // Check for optional version declaration.
        if (this.peekString('%HUML')) {
            this.advance(5);

            if (!this.done() && this.data[this.pos] === ' ') {
                this.advance(1);

                // Parse version string.
                const start = this.pos;
                while (!this.done() && ![' ', '\n', '#'].includes(this.data[this.pos])) {
                    this.pos++;
                }

                if (this.pos > start) {
                    const version = this.data.substring(start, this.pos);
                    if (version !== 'v0.1.0') {
                        throw this.error(`unsupported version '${version}'. expected 'v0.1.0'`);
                    }
                }
            }

            this.consumeLine();
        }

        // Skip initial blank lines/comments.
        this.skipBlankLines();

        if (this.done()) {
            throw this.error('empty doc is undefined');
        }

        // Root must not be indented.
        if (this.getCurIndent() !== 0) {
            throw this.error('root element must not be indented');
        }

        // Check for forbidden root indicators.
        if (this.peekString('::')) {
            throw this.error("'::' indicator not allowed at document root");
        }
        if (this.peekString(':') && !this.hasKeyValuePair()) {
            throw this.error("':' indicator not allowed at document root");
        }

        // Determine and parse root type.
        const rootType = this.getRootType();

        const typeHandlers = {
            [TYPES.INLINE_DICT]: () => this.assertRootEnd(
                this.parseInlineVectorContents(TYPES.INLINE_DICT),
                'root inline dict'
            ),
            [TYPES.MULTILINE_DICT]: () => this.parseMultilineDict(0),
            [TYPES.EMPTY_LIST]: () => {
                this.advance(2);
                this.consumeLine();
                return this.assertRootEnd([], 'root list');
            },
            [TYPES.EMPTY_DICT]: () => {
                this.advance(2);
                this.consumeLine();
                return this.assertRootEnd({}, 'root dict');
            },
            [TYPES.MULTILINE_LIST]: () => this.parseMultilineList(0),
            [TYPES.INLINE_LIST]: () => this.assertRootEnd(
                this.parseInlineVectorContents(TYPES.INLINE_LIST),
                'root inline list'
            ),
            [TYPES.SCALAR]: () => {
                const val = this.parseValue(0);
                this.consumeLine();
                return this.assertRootEnd(val, 'root scalar value');
            }
        };

        const handler = typeHandlers[rootType];
        if (!handler) {
            throw this.error('internal error: unknown document type');
        }

        return handler();
    }

    // Determines the type of the root element by analyzing the current position.
    getRootType() {
        if (this.hasKeyValuePair()) {
            return this.hasInlineDictAtRoot() ? TYPES.INLINE_DICT : TYPES.MULTILINE_DICT;
        }

        const rootTypeMap = [
            [() => this.peekString('[]'), TYPES.EMPTY_LIST],
            [() => this.peekString('{}'), TYPES.EMPTY_DICT],
            [() => this.peekChar(this.pos) === '-', TYPES.MULTILINE_LIST],
            [() => this.hasInlineListAtRoot(), TYPES.INLINE_LIST]
        ];

        for (const [condition, type] of rootTypeMap) {
            if (condition()) return type;
        }

        return TYPES.SCALAR;
    }

    // Ensures no content follows the root element.
    assertRootEnd(val, description) {
        this.skipBlankLines();
        if (!this.done()) {
            throw this.error(`unexpected content after ${description}`);
        }
        return val;
    }

    // Parses a multiline dictionary with strict indentation.
    parseMultilineDict(indent) {
        const out = {};

        while (true) {
            this.skipBlankLines();
            if (this.done()) break;

            const curIndent = this.getCurIndent();
            if (curIndent < indent) break; // De-indented, dict ends.

            if (curIndent !== indent) {
                throw this.error(`bad indent ${curIndent}, expected ${indent}`);
            }

            if (!this.isKeyStart()) {
                throw this.error(`invalid character '${this.data[this.pos]}', expected key`);
            }

            const key = this.parseKey();

            if (key in out) {
                throw this.error(`duplicate key '${key}' in dict`);
            }

            const indicator = this.parseIndicator();

            let val;
            if (indicator === ':') {
                // Scalar value on same line.
                this.assertSpace("after ':'");

                // Check if multiline string before parsing (they consume their own newlines).
                const isMultiline = this.peekString('```') || this.peekString('"""');

                val = this.parseValue(curIndent);

                if (!isMultiline) {
                    this.consumeLine();
                }
            } else {
                // Vector value starts on next line or inline.
                val = this.parseVector(curIndent + 2);
            }

            out[key] = val;
        }

        return out;
    }

    // Parses a multiline list with list item indicators (-).
    parseMultilineList(indent) {
        const out = [];

        while (true) {
            this.skipBlankLines();
            if (this.done()) break;

            const curIndent = this.getCurIndent();
            if (curIndent < indent) break;

            if (curIndent !== indent) {
                throw this.error(`bad indent ${curIndent}, expected ${indent}`);
            }

            if (this.data[this.pos] !== '-') break;

            this.advance(1);
            this.assertSpace("after '-'");

            let val;
            if (this.peekString('::')) {
                // Nested vector.
                this.advance(2);
                val = this.parseVector(curIndent + 2);
            } else {
                // Scalar value.
                val = this.parseValue(curIndent);
                this.consumeLine();
            }

            out.push(val);
        }

        return out;
    }

    // Determines if a multiline vector is a list or dict by peeking at next line.
    getMultilineVectorType(indent) {
        this.skipBlankLines();

        if (this.done()) {
            throw this.error("ambiguous empty vector after '::'. Use [] or {}.");
        }

        const curIndent = this.getCurIndent();
        if (curIndent < indent) {
            throw this.error("ambiguous empty vector after '::'. Use [] or {}.");
        }

        return this.data[this.pos] === '-' ? 'list' : 'dict';
    }

    // Parses a vector (list or dict) after :: indicator.
    parseVector(indent) {
        // Save position to check for multiline vs inline.
        const startPos = this.pos;
        this.skipSpaces();

        // Multiline vector if followed by newline/comment.
        if (this.done() || this.data[this.pos] === '\n' || this.data[this.pos] === '#') {
            this.pos = startPos;
            this.consumeLine();

            const vecType = this.getMultilineVectorType(indent);
            const nextIndent = this.getCurIndent();

            return vecType === 'list'
                ? this.parseMultilineList(nextIndent)
                : this.parseMultilineDict(nextIndent);
        }

        // Inline vector requires exactly one space after ::.
        this.pos = startPos;
        this.assertSpace("after '::'");

        return this.parseInlineVector();
    }

    // Parses inline vectors - can be [], {}, or comma-separated values.
    parseInlineVector() {
        // Check for empty collection markers.
        if (this.peekString('[]')) {
            this.advance(2);
            this.consumeLine();
            return [];
        }

        if (this.peekString('{}')) {
            this.advance(2);
            this.consumeLine();
            return {};
        }

        // Determine if dict or list by looking for key: pattern.
        return this.hasInlineDict()
            ? this.parseInlineVectorContents(TYPES.INLINE_DICT)
            : this.parseInlineVectorContents(TYPES.INLINE_LIST);
    }

    // Unified parser for inline lists and dicts.
    parseInlineVectorContents(type) {
        const result = type === TYPES.INLINE_DICT ? {} : [];
        let isFirst = true;

        while (!this.done() && this.data[this.pos] !== '\n' && this.data[this.pos] !== '#') {
            if (!isFirst) {
                this.expectComma();
            }
            isFirst = false;

            if (type === TYPES.INLINE_DICT) {
                const key = this.parseKey();

                if (this.done() || this.data[this.pos] !== ':') {
                    throw this.error("expected ':' in inline dict");
                }

                this.advance(1);
                this.assertSpace('in inline dict');

                result[key] = this.parseValue(0);
            } else {
                result.push(this.parseValue(0));
            }

            // Only skip spaces if comma might follow.
            if (!this.done() && this.data[this.pos] === ' ') {
                let nextPos = this.pos + 1;
                while (nextPos < this.data.length && this.data[nextPos] === ' ') {
                    nextPos++;
                }
                if (nextPos < this.data.length && this.data[nextPos] === ',') {
                    this.skipSpaces();
                } else {
                    break; // Trailing spaces at end of line.
                }
            }
        }

        this.consumeLine();
        return result;
    }

    // Parses a key - either bare identifier or quoted string.
    parseKey() {
        this.skipSpaces();

        if (this.peekChar(this.pos) === '"') {
            return this.parseString();
        }

        const start = this.pos;
        while (!this.done() && (this.isAlphaNum(this.data[this.pos]) ||
            this.data[this.pos] === '-' || this.data[this.pos] === '_')) {
            this.pos++;
        }

        if (this.pos === start) {
            throw this.error('expected a key');
        }

        return this.data.substring(start, this.pos);
    }

    // Parses : or :: indicator after a key.
    parseIndicator() {
        if (this.done() || this.data[this.pos] !== ':') {
            throw this.error("expected ':' or '::' after key");
        }

        this.advance(1);

        if (!this.done() && this.data[this.pos] === ':') {
            this.advance(1);
            return '::';
        }

        return ':';
    }

    // Parses any scalar value - strings (always quoted), numbers, booleans, null, special floats.
    parseValue(keyIndent) {
        if (this.done()) {
            throw this.error('unexpected end of input, expected a value');
        }

        const c = this.data[this.pos];

        // Strings MUST be quoted.
        if (c === '"') {
            return this.peekString('"""')
                ? this.parseMultilineString(keyIndent, false)
                : this.parseString();
        }

        if (c === '`' && this.peekString('```')) {
            return this.parseMultilineString(keyIndent, true);
        }

        for (const [str, value] of SPECIAL_VALUES) {
            if (this.peekString(str)) {
                this.advance(str.length);
                return value;
            }
        }

        if (c === '+') {
            this.advance(1);
            if (this.peekString('inf')) {
                this.advance(3);
                return Infinity;
            }
            if (this.isDigit(this.peekChar(this.pos))) {
                this.pos--;
                return this.parseNumber();
            }
            throw this.error("invalid character after '+'");
        }

        if (c === '-') {
            this.advance(1);
            if (this.peekString('inf')) {
                this.advance(3);
                return -Infinity;
            }
            if (this.isDigit(this.peekChar(this.pos))) {
                this.pos--;
                return this.parseNumber();
            }
            throw this.error("invalid character after '-'");
        }

        if (this.isDigit(c)) {
            return this.parseNumber();
        }

        throw this.error(`unexpected character '${c}' when parsing value`);
    }

    // Parses quoted strings with escape sequences.
    parseString() {
        this.advance(1); // Skip opening quote.

        let result = '';

        while (!this.done()) {
            const c = this.data[this.pos];

            if (c === '"') {
                this.advance(1);
                return result;
            }

            if (c === '\n') {
                throw this.error('newlines not allowed in single-line strings');
            }

            if (c === '\\') {
                this.advance(1);
                if (this.done()) {
                    throw this.error('incomplete escape sequence');
                }

                const esc = this.data[this.pos];

                if (ESCAPE_MAP.hasOwnProperty(esc)) {
                    result += ESCAPE_MAP[esc];
                } else if (esc === 'u') {
                    // Unicode escape.
                    if (this.pos + 4 >= this.data.length) {
                        throw this.error('incomplete unicode escape sequence \\u');
                    }
                    const hex = this.data.substring(this.pos + 1, this.pos + 5);
                    const code = parseInt(hex, 16);
                    if (isNaN(code)) {
                        throw this.error(`invalid unicode escape sequence \\u${hex}`);
                    }
                    result += String.fromCharCode(code);
                    this.advance(4);
                } else {
                    throw this.error(`invalid escape character '\\${esc}'`);
                }
            } else {
                result += c;
            }

            this.advance(1);
        }

        throw this.error('unclosed string');
    }

    // Parses multiline strings - ``` preserves spacing, """ strips whitespace.
    parseMultilineString(keyIndent, preserveSpaces) {
        const delim = this.data.substring(this.pos, this.pos + 3);
        this.advance(3);

        this.consumeLine();

        // Define line processing based on string type.
        const processLine = preserveSpaces
            ? (content, lineIndent) => {
                // Strip required 2-space indent relative to key.
                const reqIndent = keyIndent + 2;
                if (content.length >= reqIndent && this.isSpaceString(content.substring(0, reqIndent))) {
                    return content.substring(reqIndent);
                }
                return content;
            }
            : (content) => content.trim(); // Strip all whitespace for """.

        const lines = [];

        while (!this.done()) {
            const lineStartPos = this.pos;
            let lineIndent = 0;

            // Count indentation.
            while (!this.done() && this.data[this.pos] === ' ') {
                lineIndent++;
                this.pos++;
            }

            // Check for closing delimiter.
            if (this.peekString(delim)) {
                if (lineIndent !== keyIndent) {
                    throw this.error(`multiline closing delimiter must be at same indentation as the key (${keyIndent} spaces)`);
                }

                this.advance(3);
                this.consumeLine();

                return lines.join('\n');
            }

            // Get line content.
            this.pos = lineStartPos;
            const lineContent = this.consumeLineContent();

            lines.push(processLine(lineContent, lineIndent));
        }

        throw this.error('unclosed multiline string');
    }

    // Parses numbers in various formats (decimal, hex, octal, binary, float).
    parseNumber() {
        const start = this.pos;

        // Handle sign.
        const c = this.peekChar(this.pos);
        if (c === '+' || c === '-') {
            this.advance(1);
        }

        // Check for special bases.
        for (const [prefix, base] of NUMBER_BASE_PREFIXES) {
            if (this.peekString(prefix)) {
                return this.parseBase(start, base, prefix);
            }
        }

        // Parse decimal number.
        let isFloat = false;

        while (!this.done()) {
            const c = this.data[this.pos];

            if (this.isDigit(c) || c === '_') {
                this.advance(1);
            } else if (c === '.') {
                isFloat = true;
                this.advance(1);
            } else if (['e', 'E'].includes(c)) {
                isFloat = true;
                this.advance(1);
                if (['+', '-'].includes(this.peekChar(this.pos))) {
                    this.advance(1);
                }
            } else {
                break;
            }
        }

        // Remove underscores and parse.
        const numStr = this.data.substring(start, this.pos).replace(/_/g, '');

        return isFloat ? parseFloat(numStr) : parseInt(numStr, 10);
    }

    // Parses numbers in non-decimal bases.
    parseBase(start, base, prefix) {
        this.advance(prefix.length);
        const numStart = this.pos;

        const validators = {
            16: c => this.isHex(c),
            8: c => c >= '0' && c <= '7',
            2: c => ['0', '1'].includes(c)
        };

        const isValid = validators[base];

        while (!this.done() && isValid(this.data[this.pos])) {
            this.advance(1);
        }

        if (this.pos === numStart) {
            throw this.error('invalid number literal, requires digits after prefix');
        }

        const sign = this.data[start] === '-' ? -1 : 1;
        const numStr = this.data.substring(numStart, this.pos).replace(/_/g, '');

        return sign * parseInt(numStr, base);
    }

    // Skips blank lines and validates no trailing spaces.
    skipBlankLines() {
        while (!this.done()) {
            const lineStart = this.pos;
            this.skipSpaces();

            if (this.done()) {
                if (this.pos > lineStart) {
                    throw this.error('trailing spaces are not allowed');
                }
                return;
            }

            if (!['\n', '#'].includes(this.data[this.pos])) {
                return; // Found content.
            }

            if (this.data[this.pos] === '\n' && this.pos > lineStart) {
                throw this.error('trailing spaces are not allowed');
            }

            this.pos = lineStart;
            this.consumeLine();
        }
    }

    // Validates and consumes rest of line including comments.
    consumeLine() {
        const contentStart = this.pos;
        this.skipSpaces();

        if (this.done() || this.data[this.pos] === '\n') {
            if (this.pos > contentStart) {
                throw this.error('trailing spaces are not allowed');
            }
        } else if (this.data[this.pos] === '#') {
            if (this.pos === contentStart && this.getCurIndent() !== this.pos - this.lineStart()) {
                throw this.error('a value must be separated from an inline comment by a space');
            }

            this.pos++;
            if (!this.done() && ![' ', '\n'].includes(this.data[this.pos])) {
                throw this.error("comment hash '#' must be followed by a space");
            }
        } else {
            throw this.error('unexpected content at end of line');
        }

        // Check for trailing spaces in rest of line.
        const remLine = this.data.slice(this.pos, this.data.indexOf('\n', this.pos));
        if (remLine.endsWith(' ') && remLine.length > 0) {
            throw this.error('trailing spaces are not allowed');
        }

        // Move to next line
        const nextNewline = this.data.indexOf('\n', this.pos);
        if (nextNewline !== -1) {
            this.pos = nextNewline + 1;
            this.line++;
        } else {
            this.pos = this.data.length;
        }
    }

    // Consumes line content without validation (for multiline strings).
    consumeLineContent() {
        const start = this.pos;
        const nextNewline = this.data.indexOf('\n', this.pos);

        if (nextNewline === -1) {
            // No more newlines, consume to end
            const content = this.data.substring(start);
            this.pos = this.data.length;
            return content;
        }

        const content = this.data.substring(start, nextNewline);
        this.pos = nextNewline + 1;
        this.line++;

        return content;
    }

    // Ensures exactly one space at current position.
    assertSpace(context) {
        if (this.done() || this.data[this.pos] !== ' ') {
            throw this.error(`expected single space ${context}`);
        }

        this.advance(1);

        if (!this.done() && this.data[this.pos] === ' ') {
            throw this.error(`expected single space ${context}, found multiple`);
        }
    }

    // Validates comma usage in inline collections.
    expectComma() {
        this.skipSpaces();

        if (this.done() || this.data[this.pos] !== ',') {
            throw this.error('expected a comma in inline collection');
        }

        if (this.pos > 0 && this.data[this.pos - 1] === ' ') {
            throw this.error('no spaces allowed before comma');
        }

        this.advance(1);
        this.assertSpace('after comma');
    }

    // Helper methods for position and character analysis.
    getCurIndent() {
        const lineStart = this.lineStart();
        let indent = 0;

        while (lineStart + indent < this.data.length &&
            this.data[lineStart + indent] === ' ') {
            indent++;
        }

        return indent;
    }

    lineStart() {
        let start = this.pos;

        if (start > 0 && start <= this.data.length && this.data[start - 1] === '\n') {
            return start;
        }

        return this.data.lastIndexOf('\n', start - 1) + 1;
    }

    // Lookahead methods to determine structure types.

    hasKeyValuePair() {
        const savedPos = this.pos;

        try {
            this.parseKey();
            return !this.done() && this.data[this.pos] === ':';
        } catch {
            return false;
        } finally {
            this.pos = savedPos;
        }
    }

    hasInlineDict() {
        return Array.from(this.data.slice(this.pos)).some((char, i) => {
            const actualPos = this.pos + i;
            if (['\n', '#'].includes(char)) return false;
            return char === ':' && (actualPos + 1 >= this.data.length || this.data[actualPos + 1] !== ':');
        });
    }

    hasInlineListAtRoot() {
        const line = this.data.slice(this.pos, this.data.indexOf('\n', this.pos));
        const commentIdx = line.indexOf('#');
        const content = commentIdx >= 0 ? line.slice(0, commentIdx) : line;

        return content.includes(',') && !content.includes(':');
    }

    hasInlineDictAtRoot() {
        const lineEnd = this.data.indexOf('\n', this.pos);
        const commentIdx = this.data.indexOf('#', this.pos);
        const end = Math.min(
            lineEnd === -1 ? this.data.length : lineEnd,
            commentIdx === -1 ? this.data.length : commentIdx
        );

        const line = this.data.slice(this.pos, end);
        const hasColon = line.includes(':') && !line.includes('::');
        const hasComma = line.includes(',');

        if (!(hasColon && hasComma)) {
            return false;
        }

        // Check if there's any content after this line (excluding blank lines and comments)
        const remContent = this.data.slice(lineEnd === -1 ? this.data.length : lineEnd)
            .split('\n')
            .slice(1) // Skip the current line
            .some(line => {
                const trimmed = line.trim();
                return trimmed && !trimmed.startsWith('#');
            });

        return !remContent;
    }

    // Utility methods.

    isKeyStart() {
        return !this.done() && (this.data[this.pos] === '"' || this.isAlpha(this.data[this.pos]));
    }

    done() {
        return this.pos >= this.data.length;
    }

    advance(n) {
        this.pos += n;
    }

    skipSpaces() {
        while (!this.done() && this.data[this.pos] === ' ') {
            this.advance(1);
        }
    }

    peekString(s) {
        return this.pos + s.length <= this.data.length &&
            this.data.startsWith(s, this.pos);
    }

    peekChar(pos) {
        return pos >= 0 && pos < this.data.length ? this.data[pos] : '\0';
    }

    isDigit(c) {
        return c >= '0' && c <= '9';
    }

    isAlpha(c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }

    isAlphaNum(c) {
        return this.isAlpha(c) || this.isDigit(c);
    }

    isHex(c) {
        return this.isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    }

    isSpaceString(s) {
        return s.trim() === '';
    }

    error(message) {
        return new ParseError(message, this.line);
    }
}

// Main parsing function..
export function parse(data) {
    if (typeof data !== 'string') {
        throw new TypeError('HUML input must be of type string');
    }

    const parser = new Parser(data);
    return parser.parse();
}


export default { parse };
