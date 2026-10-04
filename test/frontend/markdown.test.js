import { describe, it, expect } from 'vitest'
import { isSafeUrl, renderMarkdown, markdownToPlain, TOOLS, toolbarOf, formatSelection, continueList } from '@u/markdown'

// The renderer of the markdown field, what it makes of a text for a table, and the buttons of the editor.

const render = renderMarkdown
const dom = (markdown) => {
  const box = document.createElement('div')
  box.innerHTML = renderMarkdown(markdown)
  return box
}

describe('isSafeUrl', () => {
  it.each(['https://example.com', 'http://example.com/a?b=1&c=2', 'mailto:a@b.co', 'tel:+442071838750', '/path', '../up', '#anchor', 'page.html', '//cdn.example.com/x.png', 'HTTPS://EXAMPLE.COM'])('accepts %s', (url) => {
    expect(isSafeUrl(url)).toBe(true)
  })

  it.each(['javascript:alert(1)', 'JavaScript:alert(1)', 'java\nscript:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'jav&#x61;script:alert(1)'.replace('&#x61;', 'a'), 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', 'ftp://x', '', '   '])('refuses %j', (url) => {
    expect(isSafeUrl(url)).toBe(false)
  })

  it('refuses what is not a text, or an address with a control character in its scheme', () => {
    expect(isSafeUrl(undefined)).toBe(false)
    expect(isSafeUrl('java\u0000script:alert(1)')).toBe(false)
  })
})

describe('renderMarkdown: text', () => {
  it('gives nothing for no text', () => {
    for (const text of [undefined, null, '', '   ', '\n\n']) {
      expect(render(text), String(text)).toBe('')
    }
  })

  it('writes a paragraph, and a blank line between two', () => {
    expect(render('one')).toBe('<p>one</p>')
    expect(render('one\n\ntwo')).toBe('<p>one</p><p>two</p>')
  })

  it('keeps a line break inside a paragraph as one, and makes a hard break of two spaces or a backslash', () => {
    expect(render('one\ntwo')).toBe('<p>one\ntwo</p>')
    expect(render('one  \ntwo')).toBe('<p>one<br>\ntwo</p>')
    expect(render('one\\\ntwo')).toBe('<p>one<br>\ntwo</p>')
  })

  it('reads the line endings of Windows and old Macs', () => {
    expect(render('a\r\n\r\nb\rc')).toBe('<p>a</p><p>b\nc</p>')
  })

  it('escapes the HTML of the text: it is shown, not written', () => {
    expect(render('a <b>bold</b> & "quoted"')).toBe('<p>a &lt;b&gt;bold&lt;/b&gt; &amp; "quoted"</p>')
    expect(render('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('cuts a text that is far too long', () => {
    const html = render('x'.repeat(300000))
    expect(html.length).toBeLessThan(200100)
  })
})

describe('renderMarkdown: blocks', () => {
  it('writes the six headings, and drops the closing signs', () => {
    for (let level = 1; level <= 6; level++) {
      expect(render(`${'#'.repeat(level)} Title`)).toBe(`<h${level}>Title</h${level}>`)
    }
    expect(render('## Title ##')).toBe('<h2>Title</h2>')
    expect(render('####### seven')).toBe('<p>####### seven</p>')
    expect(render('#nospace')).toBe('<p>#nospace</p>')
  })

  it('writes a heading for a line with = or - under it', () => {
    expect(render('Title\n=====')).toBe('<h1>Title</h1>')
    expect(render('Title\n-----')).toBe('<h2>Title</h2>')
  })

  it('writes a rule', () => {
    for (const rule of ['---', '***', '___', '- - -', '*  *  *']) {
      expect(render(`a\n\n${rule}\n\nb`), rule).toBe('<p>a</p><hr><p>b</p>')
    }
  })

  it('writes a quote, a quote inside a quote, and the blocks inside it', () => {
    expect(render('> one\n> two')).toBe('<blockquote><p>one\ntwo</p></blockquote>')
    expect(render('> a\n>> b')).toContain('<blockquote><p>a')
    expect(render('> # Title\n> text')).toBe('<blockquote><h1>Title</h1><p>text</p></blockquote>')
    expect(render('> - one\n> - two')).toBe('<blockquote><ul><li>one</li><li>two</li></ul></blockquote>')
  })

  it('writes a code block, with the language, whatever is inside it', () => {
    expect(render('```js\nconst a = 1 < 2\n```')).toBe('<pre><code class="language-js">const a = 1 &lt; 2</code></pre>')
    expect(render('```\n**not bold**\n# not a title\n```')).toBe('<pre><code>**not bold**\n# not a title</code></pre>')
    expect(render('~~~\ncode\n~~~')).toBe('<pre><code>code</code></pre>')
  })

  it('ends a code block at a line of the same sign, and at the end of the text', () => {
    expect(render('````\n```\ninside\n```\n````')).toBe('<pre><code>```\ninside\n```</code></pre>')
    expect(render('```\nno end')).toBe('<pre><code>no end</code></pre>')
  })

  it('does not take a language that is not a word for a class', () => {
    // the line is not the start of a block of code: it is text, and nothing of it is an attribute
    const box = dom('```js" onload="x\ncode\n```')
    expect([...box.querySelectorAll('*')].some(element => element.hasAttribute('onload'))).toBe(false)
    expect(box.querySelector('code[class]')).toBeNull()
  })
})

describe('renderMarkdown: lists', () => {
  it('writes a list with -, * or +', () => {
    for (const mark of ['-', '*', '+']) {
      expect(render(`${mark} one\n${mark} two`), mark).toBe('<ul><li>one</li><li>two</li></ul>')
    }
  })

  it('writes a numbered list, starting where it starts', () => {
    expect(render('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>')
    expect(render('3. three\n4. four')).toBe('<ol start="3"><li>three</li><li>four</li></ol>')
    expect(render('1) one\n2) two')).toBe('<ol><li>one</li><li>two</li></ol>')
  })

  it('writes the text of an item with its bold and its links', () => {
    expect(render('- **bold** and [a link](/x)')).toBe('<ul><li><strong>bold</strong> and <a href="/x">a link</a></li></ul>')
  })

  it('nests a list under an item that is indented', () => {
    expect(render('- one\n  - inner\n  - inner two\n- two')).toBe('<ul><li>one<ul><li>inner</li><li>inner two</li></ul></li><li>two</li></ul>')
    expect(render('1. one\n   - inner\n2. two')).toBe('<ol><li>one<ul><li>inner</li></ul></li><li>two</li></ol>')
  })

  it('writes a task list, with boxes that cannot be clicked', () => {
    const box = dom('- [x] done\n- [ ] to do')
    const inputs = [...box.querySelectorAll('input')]
    expect(inputs.map(input => input.checked)).toEqual([true, false])
    expect(inputs.every(input => input.disabled && input.type === 'checkbox')).toBe(true)
    expect(box.textContent.trim()).toBe('done to do')
  })

  it('ends a list at a blank line and a paragraph, and keeps a list of the other kind apart', () => {
    expect(render('- one\n\ntext')).toBe('<ul><li>one</li></ul><p>text</p>')
    expect(render('- one\n1. two')).toBe('<ul><li>one</li></ul><ol><li>two</li></ol>')
  })

  it('does not take a dash in a sentence for a list', () => {
    expect(render('well - no')).toBe('<p>well - no</p>')
    expect(render('-nospace')).toBe('<p>-nospace</p>')
  })

  it('does not go deeper than it should', () => {
    const deep = Array.from({ length: 12 }, (value, index) => `${'  '.repeat(index)}- level ${index}`).join('\n')
    expect(() => render(deep)).not.toThrow()
    expect(render(Array.from({ length: 20 }, () => '>').join('') + ' deep')).toContain('deep')
  })
})

describe('renderMarkdown: tables', () => {
  it('writes a table with its head and its rows', () => {
    expect(render('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')).toBe('<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>')
  })

  it('takes the alignment of the second row', () => {
    const html = render('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |')
    expect(html).toContain('<th align="left">a</th>')
    expect(html).toContain('<th align="center">b</th>')
    expect(html).toContain('<td align="right">3</td>')
  })

  it('needs no pipe at the ends, and fills a row that is short', () => {
    expect(render('a | b\n--|--\n1')).toBe('<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td></td></tr></tbody></table>')
  })

  it('writes the inline text of a cell, and keeps an escaped pipe in it', () => {
    expect(render('| a |\n|---|\n| **b** \\| c |')).toContain('<td><strong>b</strong> | c</td>')
  })

  it('does not take a line with a pipe for a table', () => {
    expect(render('a | b')).toBe('<p>a | b</p>')
    expect(render('a | b\n---')).toBe('<h2>a | b</h2>')
  })
})

describe('renderMarkdown: inline', () => {
  it('writes bold, italic, strikethrough and code', () => {
    expect(render('**a** __b__ *c* _d_ ~~e~~ `f`')).toBe('<p><strong>a</strong> <strong>b</strong> <em>c</em> <em>d</em> <del>e</del> <code>f</code></p>')
  })

  it('writes bold and italic together', () => {
    expect(render('***both***')).toContain('<strong><em>both</em></strong>')
    expect(render('**bold _and italic_**')).toBe('<p><strong>bold <em>and italic</em></strong></p>')
  })

  it('leaves a sign that is not one: an underscore inside a word, a star with spaces', () => {
    expect(render('snake_case_name')).toBe('<p>snake_case_name</p>')
    expect(render('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>')
    expect(render('a ** b')).toBe('<p>a ** b</p>')
  })

  it('does not read what is inside code', () => {
    expect(render('`**not bold** <b>`')).toBe('<p><code>**not bold** &lt;b&gt;</code></p>')
    expect(render('`` a ` b ``')).toBe('<p><code>a ` b</code></p>')
  })

  it('takes a backslash for the character after it', () => {
    expect(render('\\*not italic\\* \\# not a title \\[x\\](y)')).toBe('<p>*not italic* # not a title [x](y)</p>')
    expect(render('a \\\\ b')).toBe('<p>a \\ b</p>')
  })
})

describe('renderMarkdown: links and pictures', () => {
  it('writes a link, opening an external one in another tab without giving it the page', () => {
    expect(render('[site](https://example.com)')).toBe('<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">site</a></p>')
    expect(render('[home](/home)')).toBe('<p><a href="/home">home</a></p>')
    expect(render('[mail](mailto:a@b.co)')).toContain('href="mailto:a@b.co"')
  })

  it('writes the title of a link', () => {
    expect(render('[site](/x "The site")')).toBe('<p><a href="/x" title="The site">site</a></p>')
  })

  it('writes the bold of the text of a link', () => {
    expect(render('[**bold** link](/x)')).toBe('<p><a href="/x"><strong>bold</strong> link</a></p>')
  })

  it('writes an address as a link, and escapes its ampersands', () => {
    expect(render('<https://example.com/a?b=1&c=2>')).toBe('<p><a href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer" target="_blank">https://example.com/a?b=1&amp;c=2</a></p>')
  })

  it('does not touch the underscores and stars of an address', () => {
    expect(render('[x](https://example.com/a_b_c/*d*)')).toContain('href="https://example.com/a_b_c/*d*"')
  })

  it('writes a picture, with its text and its title', () => {
    expect(render('![a cat](/cat.png)')).toBe('<p><img src="/cat.png" alt="a cat"></p>')
    expect(render('![a cat](https://example.com/cat.png "Tom")')).toBe('<p><img src="https://example.com/cat.png" alt="a cat" title="Tom"></p>')
  })

  it('writes the text, and no link, for an address that is not safe', () => {
    expect(render('[click](javascript:alert(1))')).toBe('<p>click</p>')
    expect(render('[click](data:text/html;base64,AAAA)')).toBe('<p>click</p>')
    expect(render('![pic](javascript:alert(1))')).toBe('<p>pic</p>')
    expect(render('[click](vbscript:x)')).toBe('<p>click</p>')
  })
})

describe('renderMarkdown: what a hostile text cannot do', () => {
  const hostile = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '<a href="javascript:alert(1)">x</a>',
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](  javascript:alert(1))',
    '[x](http://a.com"onmouseover="alert(1))',
    '![x](http://a.com/x.png"onerror="alert(1))',
    '![](x" onerror="alert(1))',
    '<iframe src="https://evil.example"></iframe>',
    '<svg onload=alert(1)>',
    '<style>body{display:none}</style>',
    '<form action="https://evil.example"><input name=password></form>',
    '[x](http://a.com "t" onclick="alert(1)")',
    '`<script>`<script>alert(1)</script>',
    '```html\n<script>alert(1)</script>\n```',
    '| <img src=x onerror=alert(1)> |\n|---|\n| <script>alert(1)</script> |',
    '> <script>alert(1)</script>',
    '- <img src=x onerror=alert(1)>',
    '# <script>alert(1)</script>',
    '<<script>alert(1);//<</script>'
  ]

  it.each(hostile)('writes nothing that runs, for %j', (text) => {
    const box = dom(text)
    for (const element of box.querySelectorAll('*')) {
      expect(['SCRIPT', 'IFRAME', 'SVG', 'STYLE', 'FORM', 'OBJECT', 'EMBED'], element.tagName).not.toContain(element.tagName)
      for (const attribute of element.attributes) {
        expect(attribute.name, `${element.tagName} ${attribute.name}`).not.toMatch(/^on/)
        if (['href', 'src'].includes(attribute.name)) {
          expect(isSafeUrl(attribute.value), attribute.value).toBe(true)
        }
      }
    }
    // the only inputs are the boxes of a task list, which cannot be changed
    for (const input of box.querySelectorAll('input')) {
      expect(input.disabled).toBe(true)
    }
  })

  it('shows the hostile text as text', () => {
    expect(dom('<script>alert(1)</script>').textContent).toBe('<script>alert(1)</script>')
  })

  it('drops the character it marks its work with, so that a text cannot make it write what it did not', () => {
    const marker = String.fromCharCode(0xe000)
    expect(render(`a ${marker}0${marker} b`)).toBe('<p>a 0 b</p>')
    expect(render(`\`code\` ${marker}0${marker}`)).toBe('<p><code>code</code> 0</p>')
  })
})

describe('markdownToPlain', () => {
  it('says what the text says, without the signs', () => {
    expect(markdownToPlain('# Title\n\nSome **bold**, _italic_ and `code`, a [link](https://x.co) and ![a cat](/c.png).')).toBe('Title Some bold, italic and code, a link and a cat.')
  })

  it('drops the markers of lists, quotes and tasks, and the rules and the fences', () => {
    expect(markdownToPlain('- one\n- [x] two\n1. three\n> four\n---\n```js\nfive\n```')).toBe('one two three four five')
  })

  it('writes a table as the words of its cells', () => {
    expect(markdownToPlain('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a b 1 2')
  })

  it('keeps an escaped sign, and a sign that is not one', () => {
    expect(markdownToPlain('\\*not\\* snake_case 2 * 3')).toBe('*not* snake_case 2 * 3')
  })

  it('gives nothing for no text', () => {
    expect(markdownToPlain(undefined)).toBe('')
    expect(markdownToPlain('')).toBe('')
    expect(markdownToPlain('---')).toBe('')
  })
})

describe('toolbarOf', () => {
  it('has every button by default, and none for false', () => {
    expect(toolbarOf(undefined)).toEqual(TOOLS)
    expect(toolbarOf(true)).toEqual(TOOLS)
    expect(toolbarOf(false)).toEqual([])
  })

  it('keeps the buttons it names, in the order of the toolbar, and leaves out what it does not know', () => {
    expect(toolbarOf(['link', 'bold', 'nothing'])).toEqual(['bold', 'link'])
    expect(toolbarOf([])).toEqual([])
  })
})

describe('formatSelection', () => {
  const apply = (tool, value, start, end = start) => formatSelection(tool, value, start, end)
  const selected = (result) => result.value.slice(result.start, result.end)

  it('wraps the selection in the signs, and selects what is inside them', () => {
    const result = apply('bold', 'a word here', 2, 6)
    expect(result.value).toBe('a **word** here')
    expect(selected(result)).toBe('word')
  })

  it('writes a word to be replaced when nothing is selected, and selects it', () => {
    const result = apply('italic', 'ab', 1)
    expect(result.value).toBe('a_italic_b')
    expect(selected(result)).toBe('italic')
  })

  it('takes the signs away when the selection is already wrapped, from outside or from inside', () => {
    const outside = apply('bold', 'a **word** here', 4, 8)
    expect(outside.value).toBe('a word here')
    expect(selected(outside)).toBe('word')
    const inside = apply('bold', 'a **word** here', 2, 10)
    expect(inside.value).toBe('a word here')
  })

  it('does the same for strikethrough and for code', () => {
    expect(apply('strike', 'x', 0, 1).value).toBe('~~x~~')
    expect(apply('code', 'x', 0, 1).value).toBe('`x`')
  })

  it('writes a block of code for a selection of several lines', () => {
    const result = apply('code', 'a\nb', 0, 3)
    expect(result.value).toBe('```\na\nb\n```')
  })

  it('goes through the headings: ## then ### then #### then none', () => {
    const first = apply('heading', 'title', 0)
    expect(first.value).toBe('## title')
    const second = apply('heading', first.value, 0)
    expect(second.value).toBe('### title')
    const third = apply('heading', second.value, 0)
    expect(third.value).toBe('#### title')
    expect(apply('heading', third.value, 0).value).toBe('title')
  })

  it('works on every line the selection touches', () => {
    expect(apply('heading', 'a\nb\nc', 0, 3).value).toBe('## a\n## b\nc')
    expect(apply('quote', 'a\nb\nc', 2, 5).value).toBe('a\n> b\n> c')
    expect(apply('ul', 'a\nb', 0, 3).value).toBe('- a\n- b')
  })

  it('writes a quote, and takes it away', () => {
    expect(apply('quote', 'a', 0).value).toBe('> a')
    expect(apply('quote', '> a\n> b', 0, 7).value).toBe('a\nb')
  })

  it('writes the lists, numbered from 1, and changes one kind into the other', () => {
    expect(apply('ol', 'a\nb\nc', 0, 5).value).toBe('1. a\n2. b\n3. c')
    expect(apply('ul', '1. a\n2. b', 0, 8).value).toBe('- a\n- b')
    expect(apply('ol', '- a\n- b', 0, 7).value).toBe('1. a\n2. b')
    expect(apply('ul', '- a\n- b', 0, 7).value).toBe('a\nb')
    expect(apply('ol', '1. a\n2. b', 0, 8).value).toBe('a\nb')
  })

  it('writes a link around the selection, and selects the address to be written', () => {
    const result = apply('link', 'see site now', 4, 8)
    expect(result.value).toBe('see [site](https://) now')
    expect(selected(result)).toBe('https://')
  })

  it('writes a link with a word to replace when nothing is selected', () => {
    const result = apply('link', '', 0)
    expect(result.value).toBe('[link](https://)')
    expect(selected(result)).toBe('https://')
  })

  it('makes the address that is selected the address of the link, and selects its text', () => {
    const result = apply('link', 'https://example.com', 0, 19)
    expect(result.value).toBe('[link](https://example.com)')
    expect(selected(result)).toBe('link')
  })

  it('does nothing for a button it does not know', () => {
    expect(apply('nothing', 'abc', 1, 2)).toEqual({ value: 'abc', start: 1, end: 2 })
  })
})

describe('continueList', () => {
  it('starts the next item at the end of an item', () => {
    expect(continueList('- one', 5)).toEqual({ value: '- one\n- ', start: 8 })
    expect(continueList('* one', 5).value).toBe('* one\n* ')
  })

  it('numbers the next item of a numbered list', () => {
    expect(continueList('1. one', 6)).toEqual({ value: '1. one\n2. ', start: 10 })
    expect(continueList('9) nine', 7).value).toBe('9) nine\n10) ')
  })

  it('keeps the indentation of a nested item, and the box of a task', () => {
    expect(continueList('  - inner', 9).value).toBe('  - inner\n  - ')
    expect(continueList('- [x] done', 10).value).toBe('- [x] done\n- [ ] ')
  })

  it('ends the list at an item with nothing in it', () => {
    expect(continueList('- one\n- ', 8)).toEqual({ value: '- one\n', start: 6 })
    expect(continueList('1. ', 3)).toEqual({ value: '', start: 0 })
  })

  it('leaves the line alone when the caret is not at its end, or it is not an item', () => {
    expect(continueList('- one', 3)).toBeNull()
    expect(continueList('plain text', 10)).toBeNull()
    expect(continueList('', 0)).toBeNull()
  })

  it('works on the line the caret is on, in the middle of a text', () => {
    expect(continueList('a\n- one\nb', 7)).toEqual({ value: 'a\n- one\n- \nb', start: 10 })
  })
})
