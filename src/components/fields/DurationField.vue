<template>
  <div class="duration-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" :input-id="inputId" />
    <v-text-field
      :id="inputId" ref="input" :model-value="display" :name="schema.model" type="text" autocomplete="off" spellcheck="false" inputmode="numeric"
      hide-details="auto" class="duration-input" :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :rules="[rule]" validate-on="blur"
      :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
      @beforeinput="onBeforeInput" @focus="onFocus" @click="placeCaret" @blur="onBlur" @update:focused="onFieldFocus"
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
  import { durationMask, durationOptions, maskDigits, maskSeconds, parseDuration, validateDuration } from '@u/duration'
  import { maskCaret, maskText, maskType } from '@u/mask'

  /**
   * A length of time typed in a box that keeps its template, `__:__`: the digits fill the slots from the left, `:` or a space ends the part (`1` and `:` make
   * `01`), Backspace takes the last digit away, and a length pasted in any way of writing it (`1h 30m`, `90`) fills the slots. It is kept as a number of
   * seconds, or nothing when no digit is typed. When the box is left what is typed is carried up (`00:90` becomes `01:30`).
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // the digits typed, in the order of the slots of the mask (the colon and the letters are not in it)
        digits: '',
        // the length that was shown last, which the first part of the mask must be wide enough for (100 hours need three digits)
        shown: 0
      }
    },
    computed: {
      /** @returns {{units: Array<Object>, min: number|undefined, max: number|undefined}} what the field says */
      options () {
        return durationOptions(this.schema)
      },
      /** @returns {Object} the slots of the box */
      mask () {
        return durationMask(this.options.units, this.options.max, this.shown, this.options.template)
      },
      /** @returns {string} the box: the mask, filled as far as the digits go */
      display () {
        return maskText(this.digits, this.mask)
      },
      /** @returns {*} the value of the record: the seconds */
      current () {
        return _.get(this.model, this.schema.model)
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
        const typed = maskSeconds(this.digits, this.mask)
        if (!(typed === value || (_.isUndefined(typed) && _.isNil(value)))) {
          this.showValue()
        }
      }
    },
    created () {
      this.showValue()
    },
    methods: {
      /** Fills the box from the value. */
      showValue () {
        const known = _.isFinite(this.current) && this.current >= 0
        this.shown = known ? this.current : 0
        this.digits = known ? maskDigits(this.current, this.mask) : ''
      },
      /** @returns {HTMLInputElement|null} */
      inputElement () {
        return this.$el && this.$el.querySelector ? this.$el.querySelector('input') : null
      },
      /** Puts the caret where the next digit goes (the box is typed from the left, whatever is clicked). */
      placeCaret () {
        const input = this.inputElement()
        if (input && input === document.activeElement && input.selectionStart === input.selectionEnd) {
          const at = maskCaret(this.digits, this.mask)
          input.setSelectionRange(at, at)
        }
      },
      /** @param {string} digits what is typed now: it is written to the record and shown */
      setDigits (digits) {
        this.digits = digits
        this._value = maskSeconds(digits, this.mask)
        this.$emit('input', this._value, this.schema.model)
        this.$nextTick(this.placeCaret)
      },
      /**
       * Every change of the box comes here (and is stopped), whatever makes it: a key, a mobile keyboard, a paste, a cut.
       * @param {InputEvent} event
       */
      onBeforeInput (event) {
        event.preventDefault()
        if (this.isLocked()) {
          return
        }
        const input = event.target
        // everything selected (the box was entered): what comes replaces it
        const all = input.value.length > 0 && input.selectionStart === 0 && input.selectionEnd === input.value.length
        const type = event.inputType || ''
        if (/^insertFrom(Paste|Drop)/.test(type)) {
          const seconds = parseDuration(event.data || _.invoke(event, 'dataTransfer.getData', 'text') || '', this.options.units)
          if (_.isFinite(seconds)) {
            this.shown = seconds
            this.setDigits(maskDigits(seconds, this.mask))
          }
        } else if (/^insert/.test(type)) {
          this.setDigits(_.reduce(_.toString(event.data), (digits, key) => maskType(digits, this.mask, key, { pad: true }), all ? '' : this.digits))
        } else if (/^delete/.test(type)) {
          this.setDigits(all ? '' : this.digits.slice(0, -1))
        }
      },
      /** @param {FocusEvent} event a box that is entered has its text selected, so that typing replaces it */
      onFocus (event) {
        if (event.target && event.target.select) {
          event.target.select()
        }
      },
      /** Leaving the box: what is typed is carried up (00:90 is 01:30), and a part that was not finished counts as typed. */
      onBlur () {
        const seconds = maskSeconds(this.digits, this.mask)
        if (_.isFinite(seconds)) {
          this.shown = seconds
          this.digits = maskDigits(seconds, this.mask)
        }
      },
      /**
       * The rule of the form (Vuetify asks for it when the box is left and when the record is saved).
       * @returns {true|string}
       */
      rule () {
        return validateDuration(this.schema, maskSeconds(this.digits, this.mask)) || true
      }
    }
  }
</script>

<style lang="scss">
.duration-field {
  .duration-input {
    max-width: 240px;
    input {
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.04em;
    }
  }
}
</style>
