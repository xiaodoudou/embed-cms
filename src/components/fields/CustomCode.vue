<template>
  <div class="code-wrapper" :class="{'is-readonly': schema.readonly, 'is-disabled': disabled || schema.disabled}">
    <field-label :schema="schema" :disabled="disabled" />
    <codemirror
      v-if="isReady"
      ref="input"
      v-model:value="_value"
      :style="getStyle()"
      :options="cmOption"
      tabindex="-1"
      @input="onChangeData"
      @focus="onFieldFocus(true)"
      @blur="onFieldFocus(false)"
    />
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import Codemirror from 'codemirror-editor-vue3'
  import 'codemirror/keymap/sublime.js'
  import 'codemirror/mode/javascript/javascript.js'
  import 'codemirror/addon/display/placeholder.js'
  import 'codemirror/mode/htmlmixed/htmlmixed.js'
  import 'codemirror/mode/css/css.js'
  import 'codemirror/lib/codemirror.css'
  import AbstractField from '@m/AbstractField'

  export default {
    components: { Codemirror },
    mixins: [AbstractField],
    data() {
      return {
        isReady: false,
        cmOption: {
          height: 'auto',
          viewportMargin: Infinity,
          tabSize: this.getOpt('tabSize', 2),
          styleActiveLine: this.getOpt('styleActiveLine', true),
          lineNumbers: this.getOpt('lineNumbers', true),
          line: this.getOpt('line', true),
          foldGutter: this.getOpt('foldGutter', true),
          styleSelectedText: this.getOpt('styleSelectedText', true),
          mode: this.getOpt('mode', 'text/javascript'),
          keyMap: 'sublime',
          // a disabled editor also loses its cursor
          readOnly: this.disabled || this.schema.disabled ? 'nocursor' : !!this.schema.readonly,
          matchBrackets: this.getOpt('matchBrackets', true),
          showCursorWhenSelecting: this.getOpt('showCursorWhenSelecting', true),
          theme: 'cms',
          extraKeys: { 'Ctrl': 'autocomplete' },
          hintOptions: {
            completeSingle: false
          }
        }
      }
    },
    watch: {
    },
    mounted () {
      if (_.isObject(this._value)) {
        this._value = ''
      }
      if (_.get(this.cmOption, 'mode', false) === 'json') {
        this.cmOption.mode = 'javascript'
      }
      this.isReady = true
    },
    methods: {
      getStyle() {
        const height = _.get(this.schema, 'options.height', '100%')
        const width = _.get(this.schema, 'options.width', '100%')
        return _.merge({height, width}, _.get(this.schema, 'options.css', {}))
      },
      onChangeData(data) {
        _.set(this.model, _.get(this.schema, 'model', false), data)
      }
    }
  }
</script>

<style lang="scss">
.code-wrapper {
  .codemirror-container  {
    border-radius: var(--cms-radius-md);
  }
}

// The editor theme: made of tokens, so it follows the light and dark themes like the other fields
.cm-s-cms.CodeMirror {
  height: auto;
  background: var(--cms-cm-bg);
  color: var(--cms-cm-text);
  border: 1px solid var(--cms-border-strong);
  border-radius: var(--cms-radius-md);
  font-family: var(--cms-font-mono);
  font-size: var(--cms-fs-sm);
  line-height: var(--cms-lh-base);
  &.CodeMirror-focused {
    border-color: var(--cms-primary);
    box-shadow: 0 0 0 3px var(--cms-field-ring);
  }
  .CodeMirror-gutters {
    background: var(--cms-cm-bg);
    border-right: 1px solid var(--cms-border);
  }
  .CodeMirror-linenumber,
  .CodeMirror-foldgutter-open,
  .CodeMirror-foldgutter-folded {
    color: var(--cms-cm-gutter-text);
  }
  .CodeMirror-cursor {
    border-left: 2px solid var(--cms-cm-text);
  }
  .CodeMirror-activeline-background {
    background: var(--cms-cm-active-line);
  }
  .CodeMirror-selected,
  &.CodeMirror-focused .CodeMirror-selected {
    background: var(--cms-cm-selection);
  }
  .CodeMirror-matchingbracket {
    color: inherit;
    text-decoration: underline;
  }
  .cm-comment { color: var(--cms-cm-comment); }
  .cm-keyword, .cm-operator, .cm-qualifier { color: var(--cms-cm-keyword); }
  .cm-string, .cm-string-2 { color: var(--cms-cm-string); }
  .cm-number, .cm-atom, .cm-builtin, .cm-meta { color: var(--cms-cm-number); }
  .cm-property, .cm-attribute { color: var(--cms-cm-property); }
  .cm-variable, .cm-variable-2, .cm-variable-3, .cm-def, .cm-tag, .cm-type { color: var(--cms-cm-name); }
  .cm-bracket, .cm-punctuation { color: var(--cms-cm-text); }
  .cm-error { color: var(--cms-error); }
}

// Read-only and disabled look like the other fields
.code-wrapper.is-readonly .cm-s-cms.CodeMirror {
  background: var(--cms-field-readonly-bg);
  border-color: transparent;
  .CodeMirror-gutters {
    background: var(--cms-field-readonly-bg);
  }
}

.code-wrapper.is-disabled .cm-s-cms.CodeMirror {
  background: var(--cms-field-disabled-bg);
  border: 1px dashed var(--cms-border-strong);
  color: var(--cms-text-muted);
  .CodeMirror-gutters {
    background: var(--cms-field-disabled-bg);
  }
}
</style>
