<template>
  <div class="masked-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" :input-id="inputId" />
    <v-text-field
      :id="inputId" ref="input" :model-value="display" :name="schema.model" type="text" autocomplete="off" spellcheck="false"
      hide-details="auto" class="masked-input" :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :rules="[rule]" validate-on="blur"
      :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
      @beforeinput="onBeforeInput" @focus="onFocus" @click="placeCaret" @update:focused="onFieldFocus"
    />
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import TranslateService from '@s/TranslateService'
  import { maskCaret, maskComplete, maskFromText, maskText, maskType, maskValue, parseMask } from '@u/mask'
  import { validateFieldValue } from '@u/fieldValidation'

  /**
   * A text typed in a box that keeps its template, (___) ___-____ (see utils/mask.js for what a template can say): the characters fill the slots from the
   * left, what does not fit is not taken, Backspace takes the last one away, and a text pasted in any way of writing it (555-123-4567) fills the slots. The value
   * is the text as the template writes it, (555) 123-4567, or nothing when no slot is filled; a text that is not complete is refused.
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // the characters typed, one for each slot filled (the characters of the template are not in it)
        chars: ''
      }
    },
    computed: {
      /** @returns {Object|null} the template of the field, read */
      mask () {
        return parseMask(_.get(this.schema, 'options.mask', this.schema.mask), _.get(this.schema, 'options.maskCase'))
      },
      /** @returns {string} the box: the template, filled as far as the characters go */
      display () {
        return this.mask ? maskText(this.chars, this.mask) : this.chars
      },
      /** @returns {*} the value of the record */
      current () {
        return this._value
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
      // another value from outside (a record loaded, a discard): the box shows it. What is being typed is left alone.
      current (value) {
        if ((_.isNil(value) ? '' : value) !== this.typed()) {
          this.showValue()
        }
      }
    },
    created () {
      this.showValue()
    },
    methods: {
      /** @returns {string} what the characters are as a value */
      typed () {
        return this.mask ? maskValue(this.chars, this.mask) : this.chars
      },
      /** Fills the box from the value. */
      showValue () {
        this.chars = this.mask ? maskFromText(this.current, this.mask) : _.toString(this.current)
      },
      /** @returns {HTMLInputElement|null} */
      inputElement () {
        return this.$el && this.$el.querySelector ? this.$el.querySelector('input') : null
      },
      /** Puts the caret where the next character goes (the box is typed from the left, whatever is clicked). */
      placeCaret () {
        const input = this.inputElement()
        if (this.mask && input && input === document.activeElement && input.selectionStart === input.selectionEnd) {
          const at = maskCaret(this.chars, this.mask)
          input.setSelectionRange(at, at)
        }
      },
      /** @param {string} chars what is typed now: it is written to the record and shown */
      setChars (chars) {
        this.chars = chars
        this._value = this.typed() || undefined
        this.$emit('input', this._value, this.schema.model)
        this.$nextTick(this.placeCaret)
      },
      /**
       * Every change of the box comes here (and is stopped), whatever makes it: a key, a mobile keyboard, a paste, a cut.
       * @param {InputEvent} event
       */
      onBeforeInput (event) {
        event.preventDefault()
        if (this.isLocked() || !this.mask) {
          return
        }
        const input = event.target
        // everything selected (the box was entered): what comes replaces it
        const all = input.value.length > 0 && input.selectionStart === 0 && input.selectionEnd === input.value.length
        const type = event.inputType || ''
        if (/^insertFrom(Paste|Drop)/.test(type)) {
          const pasted = maskFromText(event.data || _.invoke(event, 'dataTransfer.getData', 'text') || '', this.mask)
          if (pasted !== '') {
            this.setChars(pasted)
          }
        } else if (/^insert/.test(type)) {
          this.setChars(_.reduce(_.toString(event.data), (chars, key) => maskType(chars, this.mask, key), all ? '' : this.chars))
        } else if (/^delete/.test(type)) {
          this.setChars(all ? '' : this.chars.slice(0, -1))
        }
      },
      /** @param {FocusEvent} event a box that is entered has its text selected, so that typing replaces it */
      onFocus (event) {
        if (event.target && event.target.select) {
          event.target.select()
        }
      },
      /**
       * The rule of the form (Vuetify asks for it when the box is left and when the record is saved): a text that is not complete is refused, then what the field says of
       * its text (required, the least and the most, a regex).
       * @returns {true|string}
       */
      rule () {
        if (this.mask && this.chars !== '' && !maskComplete(this.chars, this.mask)) {
          return TranslateService.get('TL_MASK_INCOMPLETE', { template: maskText('', this.mask) })
        }
        return validateFieldValue(this.schema, this.typed()) || true
      }
    }
  }
</script>

<style lang="scss">
.masked-field {
  .masked-input input {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }
}
</style>
