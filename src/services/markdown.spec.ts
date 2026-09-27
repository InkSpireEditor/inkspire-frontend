import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders Markdown to HTML', () => {
    expect(renderMarkdown('# Title\n\nSome *text*.')).toContain('<h1>Title</h1>')
    expect(renderMarkdown('Some *text*.')).toContain('<em>text</em>')
  })

  it('escapes a chapter\'s own raw HTML rather than passing it through', () => {
    const html = renderMarkdown('<script>alert("x")</script>')
    expect(html).not.toContain('<script>')
  })

  it('leaves an image tag as inert escaped text rather than a live element', () => {
    // html:false already turns this into text; the point is that no <img> element
    // survives to the DOM either way -- checking the escaped text still names
    // "onerror" would prove nothing, since that substring surviving as plain prose
    // is exactly what a safe escape looks like.
    const html = renderMarkdown('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('<img')
  })

  it('turns a bare URL into a link, since linkify is on', () => {
    expect(renderMarkdown('See https://example.com for more.')).toContain('<a href="https://example.com"')
  })
})
