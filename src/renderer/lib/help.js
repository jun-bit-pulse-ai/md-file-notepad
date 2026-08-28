/** Content for the Help menu: the shortcut sheet and the sample document. */

const SHORTCUTS = [
  {
    group: 'File',
    items: [
      ['⌘N', 'New document'],
      ['⌘O', 'Open…'],
      ['⌘P', 'Quick Open'],
      ['⌘S', 'Save'],
      ['⇧⌘S', 'Save As…'],
      ['⌥⌘R', 'Reveal in Finder'],
    ],
  },
  {
    group: 'Format',
    items: [
      ['⌘B', 'Bold'],
      ['⌘I', 'Italic'],
      ['⌘E', 'Inline code'],
      ['⇧⌘X', 'Strikethrough'],
      ['⇧⌘H', 'Highlight'],
      ['⌘K', 'Insert link'],
      ['⌘1 – ⌘6', 'Heading level'],
      ['⌘0', 'Paragraph'],
    ],
  },
  {
    group: 'Blocks',
    items: [
      ['⇧⌘8', 'Bullet list'],
      ['⇧⌘7', 'Numbered list'],
      ['⇧⌘9', 'Task list'],
      ['⇧⌘D', 'Toggle task done'],
      ['⇧⌘Q', 'Blockquote'],
      ['⌥⌘C', 'Code block'],
      ['⌥⌘T', 'Table'],
      ['⌥⌘H', 'Horizontal rule'],
    ],
  },
  {
    group: 'View',
    items: [
      ['⌘/', 'Toggle source mode'],
      ['⇧⌘F', 'Focus mode'],
      ['⇧⌘T', 'Typewriter mode'],
      ['⇧⌘1', 'Outline sidebar'],
      ['⇧⌘2', 'File sidebar'],
      ['⌘F', 'Find'],
      ['⌘+ / ⌘-', 'Zoom text'],
      ['⌘,', 'Preferences'],
    ],
  },
]

/**
 * Opens on first launch and from Help ▸ Markdown Reference. Doubles as a
 * live demo of every construct the editor renders.
 */
const MARKDOWN_REFERENCE = `# Welcome

This is a **live-preview** Markdown editor: you write plain Markdown, and it
styles itself as you type. Put the cursor inside a styled element to see its
raw syntax again.

## Text

Write **bold**, *italic*, ~~struck through~~, ==highlighted== and \`inline code\`.
Links look like [this one](https://commonmark.org). Hold ⌘ and click to open it.

## Lists

- A bullet list
- With a second item
  - And a nested one

1. Numbered lists
2. Renumber themselves as you go

- [ ] An unchecked task
- [x] A finished one — click the box to toggle it

## Quotes and rules

> Press ⌘/ at any time to see the raw Markdown for the whole document.

---

## Code

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`
}
\`\`\`

## Tables

| Feature        | Shortcut |
| -------------- | -------- |
| Bold           | ⌘B       |
| Outline        | ⇧⌘1      |
| Focus mode     | ⇧⌘F      |

Move the cursor into the table to edit the pipes directly.

## Math

Inline math like $E = mc^2$ renders as you type, and display math gets its
own block:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Images

![A placeholder](images/example.png)

Relative image paths resolve against the folder your document lives in.
`

export { MARKDOWN_REFERENCE, SHORTCUTS }
