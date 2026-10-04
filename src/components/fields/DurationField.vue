<template>
  <div class="duration-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" :input-id="inputId" />
    <v-text-field
      :id="inputId" ref="input" :model-value="text" :name="schema.model" type="text" autocomplete="off" spellcheck="false"
      :placeholder="template" persistent-placeholder hide-details="auto" class="duration-input"
      :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :rules="[rule]" validate-on="blur"
      :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
      @update:model-value="onInput" @focus="selectAll" @blur="onBlur" @update:focused="onFieldFocus"
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
  import { durationOptions, durationTemplate, formatDurationInput, parseDuration, validateDurationText } from '@u/duration'

  /**
   * A length of time typed in one box, the way people write it: `1:30`, `1h 30m`, `90` (minutes), `1.5h`. It is kept as a number of seconds, or
   * nothing when the box is empty, and written back in the form of the field when the box is left (a clock, `1:30`, for hours and minutes; letters,
   * `2d 3h`, for days or a single unit). The box shows how to write it before anything is typed.
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // what is typed in the box (text, so that what is half typed stays as typed)
        text: ''
      }
    },
    computed: {
      /** @returns {{units: Array<Object>, min: number|undefined, max: number|undefined}} what the field says */
      options () {
        return durationOptions(this.schema)
      },
      /** @returns {string} how to write a length, shown while the box is empty */
      template () {
        return durationTemplate(this.options.units)
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
        const typed = parseDuration(this.text, this.options.units)
        if (!(typed === value || (_.isUndefined(typed) && _.isNil(value)) || _.isNaN(typed))) {
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
        this.text = _.isFinite(this.current) && this.current >= 0 ? formatDurationInput(this.current, this.options.units) : ''
      },
      /** @param {string|null} text what was typed: what is not a length holds nothing, and the rule says so */
      onInput (text) {
        if (this.isLocked()) {
          return
        }
        this.text = _.isNil(text) ? '' : String(text)
        const seconds = parseDuration(this.text, this.options.units)
        this._value = _.isNaN(seconds) ? undefined : seconds
        this.$emit('input', this._value, this.schema.model)
      },
      /** @param {FocusEvent} event a box that is entered has its text selected, so that typing replaces it */
      selectAll (event) {
        if (event.target && event.target.select) {
          event.target.select()
        }
      },
      /** Leaving the box: a length is written in the form of the field (90 is 1:30). */
      onBlur () {
        const seconds = parseDuration(this.text, this.options.units)
        if (_.isFinite(seconds)) {
          this.text = formatDurationInput(seconds, this.options.units)
        }
      },
      /**
       * The rule of the form (Vuetify asks for it when the box is left and when the record is saved).
       * @returns {true|string}
       */
      rule () {
        return validateDurationText(this.schema, this.text) || true
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
    }
  }
}
</style>
