/**
 * src/utils/stripMarkdown.ts
 *
 * Strips common Markdown syntax from AI-generated strings so they render
 * cleanly as plain text in the UI (no ## headers, **bold**, _italic_, etc.).
 */

export function stripMarkdown(text: string): string {
  return text
    // Remove ATX headings: ## Heading ## or ## Heading
    .replace(/#{1,6}\s+(.+?)(\s+#+)?$/gm, "$1")
    // Remove bold+italic: ***text*** or ___text___
    .replace(/(\*{3}|_{3})(.+?)\1/g, "$2")
    // Remove bold: **text** or __text__
    .replace(/(\*{2}|_{2})(.+?)\1/g, "$2")
    // Remove italic: *text* or _text_
    .replace(/([*_])(.+?)\1/g, "$2")
    // Remove inline code: `code`
    .replace(/`([^`]+)`/g, "$1")
    // Remove strikethrough: ~~text~~
    .replace(/~~(.+?)~~/g, "$1")
    // Remove blockquote markers: > text
    .replace(/^>\s+/gm, "")
    // Remove horizontal rules: ---, ***, ___
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove unordered list bullets: - item, * item, + item
    .replace(/^[\s]*[-*+]\s+/gm, "")
    // Remove ordered list numbers: 1. item
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Collapse multiple blank lines into one
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
