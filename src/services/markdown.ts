import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({ html: false, linkify: true })

/**
 * Renders `text` to sanitised HTML. `html: false` keeps a chapter's own raw HTML
 * from passing through at all, and DOMPurify runs regardless, since neither is a
 * substitute for the other. Shared so the reading view and the editor's own Read
 * toggle cannot draw the same prose two different ways.
 */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(md.render(text))
}
