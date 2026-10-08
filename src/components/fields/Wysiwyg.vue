<template>
  <div
    ref="wysiwygWrapper" class="wysiwyg-wrapper" :class="{'is-readonly': schema.readonly, 'is-disabled': disabled || schema.disabled}"
    :data-val="schema.required ? getVal() : 'not-required'"
  >
    <field-label :schema="schema" :disabled="disabled" />
    <div class="border-wrapper">
      <v-card v-if="editor" class="editor" rounded elevation="0">
        <tiptap-menu-bar class="editor__header" :class="{locked: isLocked()}" :editor="editor" :buttons="getButtons()" />
        <editor-content class="editor-content" :editor="editor" @click="focusEditor" />
      </v-card>
      <div v-if="wysiwygError.length > 0" class="error-message">{{ wysiwygError }}</div>
    </div>
    <div v-if="showHint() && wysiwygError.length === 0" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { Editor, EditorContent } from '@tiptap/vue-3'
  import StarterKit from '@tiptap/starter-kit'
  import Superscript from '@tiptap/extension-superscript'
  import { createLowlight } from 'lowlight'
  import CustomHighlight from '@m/CustomHighlight'
  import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
  import TiptapMenuBar from './TiptapMenuBar.vue'
  import AbstractField from '@m/AbstractField'
  import TranslateService from '@s/TranslateService'
  import { isEmptyRichText } from '@u/dirtyTracker'
  const lowlight = createLowlight()
  lowlight.register('javascript', CustomHighlight)

  export default {
    components: { EditorContent, TiptapMenuBar},
    mixins: [AbstractField],
    emits: ['change'],
    data () {
      return {
        loaded: false,
        key: null,
        editor: null,
        wysiwygError: ''
      }
    },
    watch: {
      model () {
        this.updateObj()
      },
      disabled () {
        if (this.editor) {
          this.editor.setEditable(!this.isLocked())
        }
      }
    },
    mounted () {
      this.editor = new Editor({
        content: this._value,
        editable: !this.isLocked(),
        extensions: [
          StarterKit.configure({history: true, code: true, codeBlock: false, blockquote: true}),
          Superscript,
          CodeBlockLowlight.configure({ lowlight })
        ],
        onUpdate: () => {
          const val = this.editor.getHTML()
          this.$emit('change', val)
          this._value = val
          this.wysiwygError = this.validateField()
        },
        onFocus: ()=> {
          this.onFieldFocus(true)
        },
        onBlur: ()=> {
          this.onFieldFocus(false)
        }
      })
      this.loaded = true
      this.updateObj()
    },
    beforeUnmount () {
      // the editor keeps listeners on the document and its own state: let it go
      if (this.editor) {
        this.editor.destroy()
      }
    },
    methods: {
      // the editable node is only as tall as its text: a click on the empty area still focuses the end of the content
      focusEditor (event) {
        if (this.editor && !this.editor.isFocused && !event.target.closest('.ProseMirror')) {
          this.editor.commands.focus('end')
        }
      },
      /** @returns {string} the HTML of the editor, empty before it exists */
      getVal() {
        return this.editor ? this.editor.getHTML() : ''
      },
      /** @returns {true|string} true, or the message: required when empty */
      validateField () {
        const val = this.getVal()
        if (this.schema.required && (_.isNil(val) || val === '' || isEmptyRichText(val))) {
          return TranslateService.get('TL_FIELD_IS_REQUIRED')
        }
        return ''
      },
      /** @returns {Array} options.buttons */
      getButtons() {
        return _.get(this.schema, 'options.buttons', [])
      },
      /** @returns {string} black in dark mode, white otherwise */
      getColorForToolbar () {
        return this.$vuetify.theme.dark ? 'black' : 'white'
      },
      /** Takes the toolbar buttons out of the tab order. */
      onInit () {
        setTimeout(() => {
          const elems = _.get(this.$refs.wysiwygWrapper, 'children[1].children[0].children[0].children[0].children[0].children[0].children', [])
          _.each(elems, (elem) => {
            elem.tabIndex = -1
            _.each(elem.children, (children) => {
              children.tabIndex = -1
              _.each(children.children, (c) => {
                c.tabIndex = -1
              })
            })
          })
        }, 10)
      },
      /**
       * Loads the value of the field into the editor.
       * @returns {boolean} false when the schema has no model
       */
      updateObj () {
        if (!_.get(this.schema, 'model', false)) {
          return false
        }
        this.loaded = true
      }
    }
  }
</script>
<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.wysiwyg-wrapper .editor-content pre{
  background-color: var(--cms-code-surface) !important;
  border-radius: var(--cms-radius-xs) !important;
}

/* Syntax highlighting: colours come from the --cms-syntax-* tokens */
.tiptap .hljs-comment,
.tiptap .hljs-quote {
  color: var(--cms-syntax-comment);
}

.tiptap .hljs-variable,
.tiptap .hljs-template-variable,
.tiptap .hljs-attribute,
.tiptap .hljs-tag,
.tiptap .hljs-name,
.tiptap .hljs-regexp,
.tiptap .hljs-link,
.tiptap .hljs-selector-id,
.tiptap .hljs-selector-class {
  color: var(--cms-syntax-function);
}

.tiptap .hljs-number,
.tiptap .hljs-meta,
.tiptap .hljs-built_in,
.tiptap .hljs-builtin-name,
.tiptap .hljs-type,
.tiptap .hljs-params {
  color: var(--cms-syntax-number);
}

.tiptap .hljs-literal {
  color: var(--cms-syntax-literal);
}

.tiptap .hljs-string,
.tiptap .hljs-title,
.tiptap .hljs-section {
  color: var(--cms-syntax-string);
}

.tiptap .hljs-symbol,
.tiptap .hljs-bullet {
  color: var(--cms-syntax-symbol);
}

.tiptap .hljs-keyword,
.tiptap .hljs-selector-tag {
  color: var(--cms-syntax-keyword);
}

.tiptap .hljs-emphasis {
  font-style: italic;
}

.tiptap .hljs-strong {
  font-weight: 700;
}

.wysiwyg-wrapper {
  position: relative;
  .border-wrapper {
    margin-top: var(--cms-space-1);
    padding: 0;
    border: 1px solid var(--cms-border-strong);
    border-radius: var(--cms-radius-md);
    overflow: hidden;
    background-color: $wysiwyg-editor-background;
    transition: border-color var(--cms-motion-fast) var(--cms-ease), box-shadow var(--cms-motion-fast) var(--cms-ease);
    &:hover {
      border-color: var(--cms-text-muted);
    }
    // focus looks like a text field: accent border and the same halo
    &:focus-within {
      border-color: var(--cms-primary);
      box-shadow: 0 0 0 3px var(--cms-field-ring);
    }
  }
  .editor {
    background-color: $wysiwyg-editor-background;
    border-radius: 0 !important;
  }
  // read-only: tinted, no border, still selectable. disabled: the page colour, a dashed border, muted text. Like the other fields.
  &.is-readonly .border-wrapper,
  &.is-readonly .border-wrapper .editor,
  &.is-readonly .border-wrapper .editor__header {
    background-color: var(--cms-field-readonly-bg);
  }
  &.is-readonly .border-wrapper,
  &.is-readonly .border-wrapper:hover {
    border-color: transparent;
  }
  &.is-disabled .border-wrapper,
  &.is-disabled .border-wrapper .editor,
  &.is-disabled .border-wrapper .editor__header {
    background-color: var(--cms-field-disabled-bg);
  }
  &.is-disabled .border-wrapper,
  &.is-disabled .border-wrapper:hover {
    border: 1px dashed var(--cms-border-strong);
  }
  &.is-disabled .editor-content {
    color: var(--cms-text-muted);
    cursor: not-allowed;
  }
  // a locked editor keeps its toolbar for orientation, but it does nothing
  .editor__header.locked {
    opacity: 0.5;
    pointer-events: none;
  }
  .editor__header {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: var(--cms-space-1) var(--cms-space-2);
    // the tinted surface of the toolbar of the Markdown field, so that the two editors look alike
    background-color: var(--cms-surface-2);
    border-bottom: 1px solid $wysiwyg-toolbar-border;
  }
  .editor-content {
    padding: var(--cms-space-3) var(--cms-space-4);
    min-height: 96px;
    font-size: var(--cms-fs-base);
    font-style: normal;
    font-weight: var(--cms-fw-regular);
    line-height: var(--cms-lh-base);
    color: var(--cms-text);
    cursor: text;
    * {
      font-synthesis: initial !important;
      -webkit-synthesis: initial !important;
      font-smooth: antialiased !important;
      -webkit-font-smooth: antialiased !important;
    }
    strong {
      font-weight: 700;
    }
    a {
      color: var(--cms-primary);
    }
    ul li {
      list-style: disc;
    }
    ol li {
      list-style: decimal;
    }
    blockquote {
      padding-left: 1rem;
      border-left: 3px solid var(--cms-border-strong);
    }

    pre {
      background: var(--cms-code-surface);
      border-radius: .5rem;
      color: var(--cms-code-text);
      font-family: JetBrainsMono, monospace;
      margin: 1.5rem 0;
      padding: .75rem 1rem;
    }
  code {
      background: none;
      color: inherit;
      font-size: 0.8rem;
      padding: 0;
    }

    /* Code styling */
    .hljs-comment,
    .hljs-quote {
      color: var(--cms-syntax-comment);
    }

    .hljs-template-variable,
    .hljs-attribute,
    .hljs-tag,
    .hljs-name,
    .hljs-regexp,
    .hljs-link,
    .hljs-name,
    .hljs-selector-id,
    .hljs-selector-class,
    .hljs-variable {
      color: var(--cms-syntax-function);
    }

    .hljs-number,
    .hljs-meta,
    .hljs-built_in,
    .hljs-builtin-name,
    .hljs-type,
    .hljs-params{
      color: var(--cms-syntax-number);
    }
    .hljs-literal{
      color: var(--cms-syntax-literal);
    }

    .hljs-symbol,
    .hljs-bullet
    {
      color: var(--cms-syntax-symbol);
    }

    .hljs-title,
    .hljs-string,
    .hljs-section {
      color: var(--cms-syntax-string);
      &.function_{
        color: var(--cms-syntax-function);
      }
    }
    .hljs-title{
      &.class_{
        color: var(--cms-syntax-function);
      }
    }
    .hljs-property,
    .hljs-attr{
      color: var(--cms-syntax-property);
    }
    .hljs-keyword,
    .hljs-operator,
    .hljs-selector-tag {
      color: var(--cms-syntax-keyword);
    }

    .hljs-emphasis {
      font-style: italic;
    }

    .hljs-strong {
      font-weight: 700;
    }
  }
  .ProseMirror:focus,
  .ProseMirror:focus-visible {
    outline: none;
  }
  .editor-content {
    .tiptap {
      p {
        margin-bottom: 8px;
        &:last-child {
          margin-bottom: 0;
        }
      }
      ul, ol {
        padding-left: 16px;
        position: relative;
        list-style-position: inside;
      }
    }
  }
  .error-message {
    @include error;
    padding: var(--cms-space-2) var(--cms-space-4);
    color: var(--cms-error);
  }
}
</style>
