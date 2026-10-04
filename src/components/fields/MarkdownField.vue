<template>
  <div class="markdown-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled, 'is-split': mode === 'split' }">
    <field-label :schema="schema" :disabled="disabled" :input-id="inputId" />
    <div class="markdown-box">
      <div v-if="tools.length || mode === 'tabs'" class="markdown-head">
        <div v-if="mode === 'tabs'" class="markdown-tabs" role="tablist" :aria-label="schema.label">
          <button
            v-for="name in ['write', 'preview']" :id="`${inputId}-tab-${name}`" :key="name" type="button" role="tab" class="markdown-tab" :class="{ 'is-active': tab === name }"
            :aria-selected="tab === name ? 'true' : 'false'" :aria-controls="`${inputId}-panel-${name}`" :tabindex="tab === name ? 0 : -1" @click="tab = name" @keydown="onTabKey"
          >
            {{ $filters.translate(name === 'write' ? 'TL_MARKDOWN_WRITE' : 'TL_MARKDOWN_PREVIEW') }}
          </button>
        </div>
        <div v-if="tools.length && !isLocked() && (mode !== 'tabs' || tab === 'write')" class="markdown-toolbar" role="toolbar" :aria-label="$filters.translate('TL_MARKDOWN_TOOLBAR')">
          <v-btn
            v-for="tool in tools" :key="tool" :class="`markdown-tool markdown-${tool}`" icon variant="text" size="small" density="comfortable" :aria-label="$filters.translate(toolLabel(tool))"
            :title="`${$filters.translate(toolLabel(tool))}${shortcutOf(tool)}`" @mousedown.prevent @click="apply(tool)"
          >
            <v-icon :icon="toolIcon(tool)" size="small" />
          </v-btn>
        </div>
      </div>
      <div class="markdown-panes">
        <div v-show="mode !== 'tabs' || tab === 'write'" :id="`${inputId}-panel-write`" class="markdown-write" :role="mode === 'tabs' ? 'tabpanel' : undefined" :aria-labelledby="mode === 'tabs' ? `${inputId}-tab-write` : undefined">
          <v-textarea
            :id="inputId" ref="input" :model-value="_value" :rows="rows" no-resize hide-details="auto" spellcheck="true" class="markdown-input"
            :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :rules="[rule]" validate-on="blur"
            :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
            @update:model-value="onChangeData" @keydown="onKey" @update:focused="onFieldFocus"
          />
        </div>
        <div v-if="mode !== false" v-show="mode !== 'tabs' || tab === 'preview'" :id="`${inputId}-panel-preview`" class="markdown-preview" :role="mode === 'tabs' ? 'tabpanel' : undefined" :aria-labelledby="mode === 'tabs' ? `${inputId}-tab-preview` : undefined" tabindex="0">
          <!-- what renderMarkdown makes of the text: only tags it writes, addresses it has checked, and DOMPurify has the last word -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-if="html" class="markdown-body" v-html="html" />
          <p v-else class="markdown-empty">{{ $filters.translate('TL_MARKDOWN_NOTHING') }}</p>
        </div>
      </div>
    </div>
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import { validateFieldValue } from '@u/fieldValidation'
  import { continueList, formatSelection, renderMarkdown, toolbarOf } from '@u/markdown'

  // what each button is called (its words are in the dictionary) and drawn as
  const TOOLS = {
    bold: { label: 'TL_MD_BOLD', icon: '$formatBold', key: 'B' },
    italic: { label: 'TL_MD_ITALIC', icon: '$formatItalic', key: 'I' },
    strike: { label: 'TL_MD_STRIKE', icon: '$formatStrikethrough' },
    heading: { label: 'TL_MD_HEADING', icon: '$formatHeader2' },
    quote: { label: 'TL_MD_QUOTE', icon: '$formatQuoteOpen' },
    ul: { label: 'TL_MD_UL', icon: '$formatListBulleted' },
    ol: { label: 'TL_MD_OL', icon: '$formatListNumbered' },
    code: { label: 'TL_MD_CODE', icon: '$codeTags' },
    link: { label: 'TL_MD_LINK', icon: '$link', key: 'K' }
  }
  const MODES = ['tabs', 'split']

  /**
   * A text written in Markdown: a box to write in, a toolbar that writes the signs (bold, italic, headings, lists, quote, code, link), and a preview of what it makes
   * (in a tab, or beside the box). The value is the Markdown text itself. Ctrl+B, Ctrl+I and Ctrl+K do what their buttons do, and Enter at the end of an item of a
   * list starts the next one.
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // the tab shown, when the preview is in a tab (a read-only text opens on what it says)
        tab: this.schema.readonly ? 'preview' : 'write'
      }
    },
    computed: {
      /** @returns {'tabs'|'split'|false} where the preview is: in a tab (by default), beside the box, or nowhere */
      mode () {
        const wanted = _.get(this.schema, 'options.preview', this.schema.preview)
        return wanted === false ? false : _.includes(MODES, wanted) ? wanted : 'tabs'
      },
      /** @returns {string[]} the buttons of the toolbar */
      tools () {
        return toolbarOf(_.get(this.schema, 'options.toolbar', this.schema.toolbar))
      },
      /** @returns {number} the height of the box, in lines */
      rows () {
        return _.clamp(Math.round(Number(_.get(this.schema, 'options.rows', this.schema.rows))) || 8, 2, 60)
      },
      /** @returns {number|undefined} the lines the box grows to before it scrolls */
      maxRows () {
        const wanted = Math.round(Number(_.get(this.schema, 'options.maxRows', this.schema.maxRows)))
        return wanted >= this.rows ? Math.min(wanted, 200) : undefined
      },
      /** @returns {string} what the text makes, as HTML */
      html () {
        return renderMarkdown(this._value)
      },
      /** @returns {boolean} */
      isReadonly () {
        return !!this.schema.readonly
      },
      /** @returns {boolean} the prop or the schema */
      isDisabled () {
        return !!(this.disabled || this.schema.disabled)
      }
    },
    watch: {
      // the box is as tall as its text (up to maxRows), and as tall as it was when the tab it is in is shown again
      _value () {
        this.$nextTick(this.fit)
      },
      tab () {
        this.$nextTick(this.fit)
      }
    },
    mounted () {
      this.$nextTick(this.fit)
    },
    methods: {
      /** Gives the box the height of its text: not fewer lines than `rows`, not more than `maxRows` (it scrolls after that). */
      fit () {
        const area = this.area()
        if (!area || !area.offsetParent) {
          return
        }
        area.style.height = 'auto'
        const line = parseFloat(getComputedStyle(area).lineHeight) || 24
        const most = this.maxRows ? this.maxRows * line + 8 : Infinity
        area.style.height = `${Math.min(area.scrollHeight, most)}px`
        area.style.overflowY = area.scrollHeight > most ? 'auto' : 'hidden'
      },
      /**
       * @param {string} tool
       * @returns {string} the key of its words
       */
      toolLabel (tool) {
        return TOOLS[tool].label
      },
      /**
       * @param {string} tool
       * @returns {string} its icon
       */
      toolIcon (tool) {
        return TOOLS[tool].icon
      },
      /**
       * @param {string} tool
       * @returns {string} the keys that do the same, to say in its tooltip (` (Ctrl+B)`), or nothing
       */
      shortcutOf (tool) {
        return TOOLS[tool].key ? ` (Ctrl+${TOOLS[tool].key})` : ''
      },
      /** @returns {HTMLTextAreaElement|null} */
      area () {
        return _.invoke(this.$refs.input, '$el.querySelector', 'textarea') || null
      },
      /**
       * Writes a text to the record, and selects what the editor says.
       * @param {{value: string, start: number, end: number}} next
       */
      write (next) {
        this.onChangeData(next.value)
        this.$nextTick(() => {
          const area = this.area()
          if (area) {
            area.focus()
            area.setSelectionRange(next.start, _.get(next, 'end', next.start))
          }
        })
      },
      /** @param {string} tool a button of the toolbar: what it does to the selection */
      apply (tool) {
        const area = this.area()
        if (!area || this.isLocked()) {
          return
        }
        this.write(formatSelection(tool, _.toString(this._value), area.selectionStart, area.selectionEnd))
      },
      /** @param {KeyboardEvent} event the keys that do what a button does, and Enter in a list */
      onKey (event) {
        if (this.isLocked()) {
          return
        }
        const area = event.target
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
          const tool = _.findKey(TOOLS, ({ key }) => key && _.toLower(key) === _.toLower(event.key))
          if (tool && _.includes(this.tools, tool)) {
            event.preventDefault()
            this.apply(tool)
          }
          return
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && area.selectionStart === area.selectionEnd) {
          const next = continueList(_.toString(this._value), area.selectionStart)
          if (next) {
            event.preventDefault()
            this.write(next)
          }
        }
      },
      /** @param {KeyboardEvent} event the arrow keys move between the tabs, as in a tab list */
      onTabKey (event) {
        const names = ['write', 'preview']
        const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
        if (step) {
          event.preventDefault()
          this.tab = names[(names.indexOf(this.tab) + step + names.length) % names.length]
          this.$nextTick(() => _.invoke(this.$el.querySelector(`#${this.inputId}-tab-${this.tab}`), 'focus'))
        }
      },
      /**
       * The rule of the form (Vuetify asks for it when the box is left and when the record is saved): what the field says of its text (required, the least and the most, a regex).
       * @param {*} text
       * @returns {true|string}
       */
      rule (text) {
        return validateFieldValue(this.schema, text) || true
      }
    }
  }
</script>

<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

.markdown-field {
  .markdown-box {
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-md);
    background: var(--cms-surface);
    overflow: hidden;
    &:focus-within {
      border-color: var(--cms-primary);
    }
  }
  .markdown-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--cms-space-2);
    padding: var(--cms-space-1) var(--cms-space-2);
    border-bottom: 1px solid var(--cms-border);
    background: var(--cms-surface-2);
  }
  .markdown-tabs {
    display: flex;
    gap: var(--cms-space-1);
  }
  .markdown-tab {
    padding: var(--cms-space-1) var(--cms-space-3);
    border: 0;
    border-radius: var(--cms-radius-sm);
    background: transparent;
    color: var(--cms-text-muted);
    font: inherit;
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-medium);
    cursor: pointer;
    &:hover {
      color: var(--cms-text);
    }
    &.is-active {
      background: var(--cms-primary-soft);
      color: var(--cms-on-primary-soft);
    }
  }
  .markdown-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .markdown-panes {
    display: flex;
    flex-direction: column;
  }
  // the textarea has no box of its own: the box around the two is the field
  .markdown-input {
    .v-field {
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .v-field__outline {
      display: none;
    }
    textarea {
      @include textarea-text;
      font-family: var(--cms-font-mono);
      // the box around the toolbar and the text shows the focus
      outline: none;
    }
  }
  .markdown-preview {
    padding: var(--cms-space-3) var(--cms-space-4);
    min-height: 120px;
    overflow: auto;
    outline-offset: -2px;
  }
  &.is-split {
    .markdown-panes {
      flex-direction: row;
      > * {
        flex: 1 1 50%;
        min-width: 0;
      }
    }
    .markdown-preview {
      border-left: 1px solid var(--cms-border);
    }
  }
  .markdown-empty {
    margin: 0;
    color: var(--cms-text-muted);
    font-style: italic;
  }
  &.is-disabled .markdown-box {
    border-style: dashed;
    opacity: 0.7;
  }
  &.is-readonly .markdown-head {
    justify-content: flex-start;
  }
}

// what a text makes: the same in the preview and anywhere else it is shown
.markdown-body {
  font-size: var(--cms-fs-base);
  line-height: 1.55;
  overflow-wrap: anywhere;
  > :first-child {
    margin-top: 0;
  }
  > :last-child {
    margin-bottom: 0;
  }
  p,
  ul,
  ol,
  blockquote,
  pre,
  table {
    margin: 0 0 var(--cms-space-3);
  }
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: var(--cms-space-4) 0 var(--cms-space-2);
    line-height: 1.25;
    font-weight: var(--cms-fw-semibold);
  }
  h1 { font-size: 1.6em; }
  h2 { font-size: 1.35em; }
  h3 { font-size: 1.15em; }
  h4,
  h5,
  h6 { font-size: 1em; }
  ul,
  ol {
    padding-left: var(--cms-space-5);
  }
  // the reset of the page takes the markers away: a list written in Markdown has them
  ul {
    list-style: disc;
  }
  ol {
    list-style: decimal;
  }
  ul ul {
    list-style: circle;
  }
  // (the reset of the page puts it on the items too)
  li {
    list-style: inherit;
  }
  blockquote {
    padding: 0 var(--cms-space-3);
    border-left: 3px solid var(--cms-border-strong);
    color: var(--cms-text-muted);
  }
  code {
    padding: 0 var(--cms-space-1);
    border-radius: var(--cms-radius-sm);
    background: var(--cms-surface-2);
    font-family: var(--cms-font-mono);
    font-size: 0.9em;
  }
  pre {
    padding: var(--cms-space-3);
    border-radius: var(--cms-radius-md);
    background: var(--cms-surface-2);
    overflow: auto;
    code {
      padding: 0;
      background: transparent;
    }
  }
  a {
    color: var(--cms-primary);
  }
  img {
    max-width: 100%;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--cms-border);
    margin: var(--cms-space-4) 0;
  }
  table {
    border-collapse: collapse;
  }
  th,
  td {
    padding: var(--cms-space-1) var(--cms-space-3);
    border: 1px solid var(--cms-border);
  }
  th {
    background: var(--cms-surface-2);
  }
}
</style>
