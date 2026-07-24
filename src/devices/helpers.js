// -----------------------------------------------------------------------------
// Small shared helpers for the device mappers.
// -----------------------------------------------------------------------------

/**
 * Parse a value into a number.
 * @param {*} value raw value
 * @returns {number|null} the parsed number, or null if not parseable
 */
export function toNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
