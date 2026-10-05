export const MAX_TEXT_IMPORT_BYTES = 8 * 1024 * 1024
export const MAX_DOC_TEXT_BYTES = 64 * 1024 * 1024
// Includes Base64 expansion of the existing 40 MiB media limit and legacy text.
export const MAX_ENVELOPE_BYTES = 96 * 1024 * 1024
export const MAX_PAYLOAD_BYTES = 72 * 1024 * 1024 - 4096
