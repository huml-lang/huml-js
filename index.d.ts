/**
 * Any valid HUML value type
 */
export type HUMLValue =
  | string
  | number
  | boolean
  | null
  | HUMLArray
  | HUMLObject;

/**
 * A HUML array
 */
export interface HUMLArray extends Array<HUMLValue> {}

/**
 * A HUML object
 */
export interface HUMLObject {
  [key: string]: HUMLValue;
}

/**
 * Configuration options for stringify
 */
export interface StringifyConfig {
  /**
   * Include the %HUML version header in the output
   * @default false
   */
  includeVersion?: boolean;
}

/**
 * Error thrown when parsing HUML fails.
 * This class is not exported, but instances may be thrown by parse().
 * The error name will be 'HUMLError' and includes a line property.
 */
declare class ParseError extends Error {
  name: 'HUMLError';
  line: number;
}

/**
 * Parse a HUML string into JavaScript data structures
 *
 * @param data - The HUML string to parse
 * @returns The parsed JavaScript value
 * @throws {TypeError} If the input is not a string
 * @throws {ParseError} If the HUML syntax is invalid (error.name === 'HUMLError')
 *
 * @example
 * ```typescript
 * import { parse } from '@huml-lang/huml';
 *
 * const data = parse(`
 * name: "Jai Desai"
 * age: 30
 * `);
 * console.log(data); // { name: "Jai Desai", age: 30 }
 * ```
 */
export function parse(data: string): HUMLValue;

/**
 * Convert JavaScript data structures into HUML format
 *
 * @param obj - The JavaScript value to stringify (null is not supported at root level)
 * @param cfg - Optional configuration for stringification
 * @returns The HUML formatted string
 * @throws {Error} If the value contains unsupported types
 *
 * @example
 * ```typescript
 * import { stringify } from '@huml-lang/huml';
 *
 * const huml = stringify({ name: "Jaya Dubey", age: 25 });
 * console.log(huml);
 * // name: "Jaya Dubey"
 * // age: 25
 * ```
 */
export function stringify(obj: Exclude<HUMLValue, null>, cfg?: StringifyConfig): string;
