<template>
  <div class="json-editor-field">
    <field-label :schema="schema" />
    <div ref="input" class="json-editor" :disabled="disabled" />
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'

  import CodeMirror from 'codemirror'
  import 'codemirror/mode/javascript/javascript.js'
  import 'codemirror/lib/codemirror.css'
  import 'codemirror/theme/dracula.css'
  import { JSONEditor } from '@json-editor/json-editor'

  const OPEN_MODAL = '.json-editor-modal:not([style*="display: none"])'
  export default {
    mixins: [AbstractField],
    data () {
      return {
        editor: null,
        originalValue: null
      }
    },
    watch: {
      'schema.model': function () {
        const value = _.extend(this.originalValue, _.get(this.model, this.schema.model))
        this.editor.setValue(value)
        _.set(this.model, this.schema.model, value)
      }
    },
    beforeUnmount () {
      document.removeEventListener('mousedown', this.onOutsideMouseDown, true)
      if (this.modalObserver) {
        this.modalObserver.disconnect()
      }
      if (this.modalHost) {
        this.modalHost.remove()
      }
    },
    mounted () {
      const element = _.get(this.$refs, 'input', false)
      if (element) {
        element.addEventListener('click', this.onEditorClick, true)
        element.addEventListener('keydown', this.onEditorKeydown)
        document.addEventListener('mousedown', this.onOutsideMouseDown, true)
        this.watchModals(element)
      }
      this.schema.jsonEditorOptions.title = ' '
      const options = {
        schema: this.schema.jsonEditorOptions,
        theme: 'cms',
        iconlib: 'foundation3'
      }
      if (this.disabled) {
        options.disable_array_delete = true
      }
      JSONEditor.defaults.themes.cms = class cms extends JSONEditor.AbstractTheme {
        getRangeInput (min, max, step) {
          return super.getRangeInput(min, max, step)
        }
        getGridContainer () {
          const el = document.createElement('div')
          el.className = 'json-editor-grid-container'
          return el
        }
        getGridRow () {
          const el = document.createElement('div')
          el.className = 'json-editor-grid-row'
          return el
        }
        getFormInputLabel (text) {
          // styled by assets/scss/components/JsonEditor.scss, like the label of every other field
          const el = super.getFormInputLabel(text)
          el.className = 'json-editor-input-label'
          return el
        }
        setGridColumnSize (el, size) {
          el.className = `span${size}`
        }
        getSelectInput (options) {
          const input = super.getSelectInput(options)
          return input
        }
        getFormInputField (type) {
          const el = super.getFormInputField(type)
          return el
        }
        afterInputReady (input) {
          if (input.controlgroup) {
            return
          }
          input.controlgroup = this.closest(input, '.control-group')
          input.controls = this.closest(input, '.controls')
          if (this.closest(input, '.compact')) {
            input.controlgroup.className = input.controlgroup.className.replace(/control-group/g, '').replace(/[ ]{2,}/g, ' ')
            input.controls.className = input.controlgroup.className.replace(/controls/g, '').replace(/[ ]{2,}/g, ' ')
            input.style.marginBottom = 0
          }
          if (this.queuedInputErrorText) {
            const text = this.queuedInputErrorText
            delete this.queuedInputErrorText
            this.addInputError(input, text)
          }
        }
        getIndentedPanel () {
          const el = document.createElement('div')
          return el
        }
        getModal () {
          // the pop-ups (Edit JSON, Object properties) are styled as a modal by assets/scss/components/JsonEditor.scss;
          // the library only toggles display
          const el = document.createElement('div')
          el.className = 'json-editor-modal'
          el.style.display = 'none'
          return el
        }
        getInfoButton (text) {
          const icon = document.createElement('span')
          icon.className = 'icon-info-sign pull-right'
          icon.style.padding = '.25rem'
          icon.style.position = 'relative'
          icon.style.display = 'inline-block'
          const tooltip = document.createElement('span')
          tooltip.style['font-family'] = 'sans-serif'
          tooltip.style.visibility = 'hidden'
          tooltip.style['background-color'] = 'var(--cms-terminal-bg)'
          tooltip.style.margin = '0 .25rem'
          tooltip.style.color = 'var(--cms-terminal-fg)'
          tooltip.style.padding = '.5rem 1rem'
          tooltip.style['border-radius'] = '.25rem'
          tooltip.style.width = '25rem'
          tooltip.style.transform = 'translateX(-27rem) translateY(-.5rem)'
          tooltip.style.position = 'absolute'
          tooltip.innerText = text
          icon.onmouseover = function () {
            tooltip.style.visibility = 'visible'
          }
          icon.onmouseleave = function () {
            tooltip.style.visibility = 'hidden'
          }
          icon.appendChild(tooltip)
          return icon
        }
        getFormInputDescription (text) {
          const el = document.createElement('p')
          el.className = 'help-inline'
          el.textContent = text
          return el
        }
        getFormControl (label, input, description, infoText) {
          const ret = document.createElement('div')
          ret.className = 'control-group'
          const controls = document.createElement('div')
          controls.className = 'controls'
          if (label && input.getAttribute('type') === 'checkbox') {
            ret.appendChild(controls)
            label.className += ' checkbox'
            label.appendChild(input)
            controls.appendChild(label)
            if (infoText) {
              controls.appendChild(infoText)
            }
            controls.style.height = '30px'
          } else {
            if (label) {
              label.className += ' control-label'
              ret.appendChild(label)
            }
            if (infoText) {
              controls.appendChild(infoText)
            }
            controls.appendChild(input)
            ret.appendChild(controls)
          }
          if (description) {
            controls.appendChild(description)
          }
          return ret
        }
        getHeaderButtonHolder () {
          const el = this.getButtonHolder()
          el.className += ' btn-groups'
          return el
        }
        getButtonHolder () {
          const el = document.createElement('div')
          el.className = 'btn-group'
          return el
        }
        getButton (text, icon, title) {
          const el = super.getButton(text, icon, title)
          el.className += ' btn btn-default'
          return el
        }
        getTable () {
          const el = document.createElement('table')
          el.className = 'table table-bordered'
          return el
        }
        getTableCell () {
          const el = document.createElement('td')
          return el
        }
        addInputError (input, text) {
          if (!input.controlgroup) {
            this.queuedInputErrorText = text
            return
          }
          if (!input.controlgroup || !input.controls) {
            return
          }
          input.controlgroup.className += ' error'
          if (!input.errmsg) {
            input.errmsg = document.createElement('p')
            input.errmsg.className = 'help-block errormsg'
            input.controls.appendChild(input.errmsg)
          } else {
            input.errmsg.style.display = ''
          }

          input.errmsg.textContent = text
        }
        removeInputError (input) {
          if (!input.controlgroup) {
            delete this.queuedInputErrorText
          }
          if (!input.errmsg) {
            return
          }
          input.errmsg.style.display = 'none'
          input.controlgroup.className = input.controlgroup.className.replace(/\s?error/g, '')
        }
        getTabHolder (propertyName) {
          const pName = _.isUndefined(propertyName) ? '' : propertyName
          const el = document.createElement('div')
          el.className = 'tabbable tabs-left'
          el.innerHTML = `<ul class='nav nav-tabs'  id='${pName}'></ul><div class='tab-content well well-small' id='${pName}'></div>`
          return el
        }
        getTopTabHolder (propertyName) {
          const pName = _.isUndefined(propertyName) ? '' : propertyName
          const el = document.createElement('div')
          el.className = 'tabbable tabs-over'
          el.innerHTML = `<ul class='nav nav-tabs' id='${pName}'></ul><div class='tab-content well well-small'  id='${pName}'></div>`
          return el
        }
        getTab (text, tabId) {
          const el = document.createElement('li')
          el.className = 'nav-item'
          const a = document.createElement('a')
          a.setAttribute('href', `#${tabId}`)
          a.appendChild(text)
          el.appendChild(a)
          return el
        }
        getTopTab (text, tabId) {
          const el = document.createElement('li')
          el.className = 'nav-item'
          const a = document.createElement('a')
          a.setAttribute('href', `#${tabId}`)
          a.appendChild(text)
          el.appendChild(a)
          return el
        }
        getTabContentHolder (tabHolder) {
          return tabHolder.children[1]
        }
        getTopTabContentHolder (tabHolder) {
          return tabHolder.children[1]
        }
        getTabContent () {
          const el = document.createElement('div')
          el.className = 'tab-pane'
          return el
        }
        getTopTabContent () {
          const el = document.createElement('div')
          el.className = 'tab-pane'
          return el
        }
        markTabActive (row) {
          row.tab.className = row.tab.className.replace(/\s?active/g, '')
          row.tab.className += ' active'
          row.container.className = row.container.className.replace(/\s?active/g, '')
          row.container.className += ' active'
        }
        markTabInactive (row) {
          row.tab.className = row.tab.className.replace(/\s?active/g, '')
          row.container.className = row.container.className.replace(/\s?active/g, '')
        }
        addTab (holder, tab) {
          holder.children[0].appendChild(tab)
        }
        addTopTab (holder, tab) {
          holder.children[0].appendChild(tab)
        }
        getProgressBar () {
          const container = document.createElement('div')
          container.className = 'progress'

          const bar = document.createElement('div')
          bar.className = 'bar'
          bar.style.width = '0%'
          container.appendChild(bar)

          return container
        }
        updateProgressBar (progressBar, progress) {
          if (!progressBar) {
            return
          }

          progressBar.firstChild.style.width = `${progress}%`
        }
        updateProgressBarUnknown (progressBar) {
          if (!progressBar) {
            return
          }

          progressBar.className = 'progress progress-striped active'
          progressBar.firstChild.style.width = '100%'
        }
      }
      this.editor = new JSONEditor(element, options)
      if (this.disabled) {
        this.editor.disable()
      }
      this.editor.on('ready', () => {
        this.originalValue = this.editor.getValue()
        const value = _.extend(this.originalValue, _.get(this.model, this.schema.model))
        this.editor.setValue(value)
        _.set(this.model, this.schema.model, value)
      })
      this.editor.on('change', () => {
        const value = this.editor.getValue()
        _.set(this.model, this.schema.model, value)
      })
    },
    methods: {
      // A form has ancestors that trap position: fixed, so an open modal is moved to the body (into a holder with the
      // same class, so that it keeps its styles) and put back in its place when the library hides it again.
      watchModals (root) {
        this.modalHost = document.createElement('div')
        this.modalHost.className = 'json-editor'
        document.body.appendChild(this.modalHost)
        this.modalHost.addEventListener('click', this.onEditorClick, true)
        this.modalHost.addEventListener('keydown', this.onEditorKeydown)
        const place = (modal) => {
          const visible = !/display:\s*none/.test(modal.getAttribute('style') || '')
          if (visible && modal.parentElement !== this.modalHost) {
            modal._home = { parent: modal.parentElement, next: modal.nextSibling }
            this.modalHost.appendChild(modal)
          }
          if (visible && !modal.dataset.title) {
            // the library hides the label of its pop-up (screen readers only): show it as the title of the modal
            // (for the properties checklist the first label is a property name: the title is the button that opened it)
            const label = modal.querySelector('label')
            const opener = modal._home && modal._home.parent.closest('.je-object__container')
            const toggle = modal.querySelector('.property-selector') && opener && opener.querySelector('.json-editor-btntype-properties')
            modal.dataset.title = (toggle ? toggle.textContent : label && label.textContent) || ''
          }
          if (visible && modal.querySelector('.property-selector') && !modal.querySelector('.je-modal-close')) {
            // the properties checklist has no button of its own to leave: a Close button (and a line saying what the boxes do)
            const hint = document.createElement('p')
            hint.className = 'je-modal-hint'
            hint.textContent = this.$filters.translate('TL_OBJECT_PROPERTIES_HINT')
            const close = document.createElement('button')
            close.type = 'button'
            close.className = 'btn je-modal-close'
            close.textContent = this.$filters.translate('TL_CLOSE')
            modal.insertBefore(hint, modal.querySelector('.property-selector'))
            modal.appendChild(close)
          }
          if (visible && (modal.style.left || modal.style.top)) {
            // the library places the pop-up next to its button; the stylesheet centres it on the screen
            modal.style.left = ''
            modal.style.top = ''
          } else if (!visible && modal.parentElement === this.modalHost && modal._home) {
            modal._home.parent.insertBefore(modal, modal._home.next)
          }
        }
        this.modalObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.target.classList && mutation.target.classList.contains('json-editor-modal')) {
              place(mutation.target)
            }
          })
        })
        this.modalObserver.observe(root, { attributes: true, attributeFilter: ['style'], subtree: true })
        this.modalObserver.observe(this.modalHost, { attributes: true, attributeFilter: ['style'], subtree: true })
      },
      openModal () {
        return this.modalHost && this.modalHost.querySelector(OPEN_MODAL)
      },
      // Edit JSON is a real code editor: JSON highlighting, line numbers, brackets
      attachCodeEditor () {
        // the open pop-up (already moved to the body, see watchModals)
        const modal = this.openModal()
        const textarea = modal && modal.querySelector('.je-edit-json--textarea')
        if (!textarea) {
          return
        }
        if (textarea._cm) {
          textarea._cm.setValue(textarea.value)
        } else {
          textarea._cm = CodeMirror.fromTextArea(textarea, {
            mode: { name: 'javascript', json: true },
            theme: 'dracula',
            lineNumbers: true,
            tabSize: 2,
            indentWithTabs: false,
            viewportMargin: Infinity
          })
        }
        textarea._cm.refresh()
        textarea._cm.focus()
      },
      // the library reads the textarea when Save or Copy is pressed: hand it what is in the code editor
      syncCodeEditor (button) {
        const modal = button.closest('.json-editor-modal')
        const textarea = modal && modal.querySelector('.je-edit-json--textarea')
        if (textarea && textarea._cm) {
          textarea._cm.save()
        }
      },
      onEditorClick (event) {
        const button = event.target.closest && event.target.closest('button')
        if (!button) {
          return
        }
        if (button.classList.contains('je-modal-close')) {
          this.closeModal(button.closest('.json-editor-modal'))
        } else if (button.classList.contains('json-editor-btntype-editjson')) {
          // after the library has put the JSON in the textarea
          setTimeout(() => this.attachCodeEditor(), 0)
        } else if (button.classList.contains('json-editor-btntype-save') || button.classList.contains('json-editor-btntype-copy')) {
          this.syncCodeEditor(button)
        }
      },
      // closes the open modal the way the library does: Cancel for Edit JSON, the toggle button for the properties
      closeModal (modal) {
        const container = modal._home && modal._home.parent.closest('.je-object__container')
        const target = modal.querySelector('.json-editor-btntype-cancel') || (container && container.querySelector('.json-editor-btntype-properties'))
        if (target) {
          target.click()
        }
      },
      onEditorKeydown (event) {
        const modal = event.key === 'Escape' && this.openModal()
        if (modal) {
          event.stopPropagation()
          this.closeModal(modal)
        }
      },
      onOutsideMouseDown (event) {
        const modal = this.openModal()
        if (modal && !modal.contains(event.target) && !event.target.closest('.json-editor-btntype-editjson, .json-editor-btntype-properties')) {
          this.closeModal(modal)
        }
      },
    }
  }
</script>
