<template>
  <div class="duration-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" />
    <div class="duration-row" role="group" :aria-label="schema.label">
      <div v-for="(unit, index) in options.units" :key="unit.name" class="duration-unit" :class="`duration-${unit.name}`">
        <v-text-field
          :id="`${inputId}-${unit.name}`" :ref="index === 0 ? 'input' : undefined" :model-value="parts[unit.name]" :name="`${schema.model}-${unit.name}`"
          type="number" min="0" step="1" inputmode="numeric" placeholder="0" persistent-placeholder autocomplete="off" hide-details
          :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :error="!!message" :rules="index === 0 ? [rule] : []" validate-on="blur"
          :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
          @update:model-value="onInput(unit.name, $event)" @focus="selectAll" @blur="onBlur" @update:focused="onFieldFocus"
        />
        <label :id="`${inputId}-${unit.name}-label`" :for="`${inputId}-${unit.name}`" class="duration-suffix">{{ $filters.translate(unitKey(unit)) }}</label>
      </div>
    </div>
    <div v-if="message" class="duration-error" role="alert">{{ message }}</div>
    <div v-else-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import { durationOptions, joinDuration, splitDuration, validateDuration } from '@u/duration'

  /**
   * A length of time, typed in the units the field shows (hours and minutes by default). It is kept as a number of seconds, or nothing when
   * every box is empty. A box can hold more than the unit above would (90 minutes): when it is left the lengths are carried up.
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // what is typed in each box (text, so that an empty box stays empty)
        parts: {},
        // what is wrong with the value, shown under the boxes
        message: '',
        // a box holds what is not a length of time (a minus sign)
        badInput: false
      }
    },
    computed: {
      /** @returns {{units: Array<Object>, min: number|undefined, max: number|undefined}} what the field says */
      options () {
        return durationOptions(this.schema)
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
      // another value from outside (a record loaded, a discard): the boxes show it. What is being typed is left alone.
      current () {
        // (an input that is not a length holds nothing: it is not another value, it is waiting to be corrected)
        if (this.badInput) {
          return
        }
        const typed = joinDuration(this.parts, this.options.units)
        if (!(typed === this.current || (_.isUndefined(typed) && _.isNil(this.current)))) {
          this.showValue()
        }
      }
    },
    created () {
      this.showValue()
    },
    methods: {
      /** Fills the boxes from the value. */
      showValue () {
        this.parts = _.isFinite(this.current) && this.current >= 0 ? _.mapValues(splitDuration(this.current, this.options.units), String) : {}
        this.badInput = false
      },
      /**
       * @param {Object} unit
       * @returns {string} the translation key of its name
       */
      unitKey (unit) {
        return `TL_UNIT_${_.toUpper(unit.name)}`
      },
      /**
       * @param {string} name the unit
       * @param {string|number|null} text what was typed
       */
      onInput (name, text) {
        if (this.isLocked()) {
          return
        }
        this.parts = { ...this.parts, [name]: _.isNil(text) ? '' : String(text) }
        const total = joinDuration(this.parts, this.options.units)
        this.badInput = _.isNaN(total)
        this._value = this.badInput ? undefined : total
        this.$emit('input', this._value, this.schema.model)
        if (this.message) {
          this.message = validateDuration(this.schema, this._value) || ''
        }
      },
      /** @param {FocusEvent} event a box that is entered has its number selected, so that typing replaces it (it shows 0 where the length is none of that unit) */
      selectAll (event) {
        if (event.target && event.target.select) {
          event.target.select()
        }
      },
      /** Leaving a box: the lengths are carried up (90 minutes are 1 hour 30), and the value is checked. */
      onBlur () {
        if (_.isFinite(this.current) && this.current >= 0) {
          this.showValue()
        }
        this.message = this.badInput ? this.$filters.translate('TL_INVALID_DURATION') : validateDuration(this.schema, this._value) || ''
      },
      /**
       * The rule of the form (Vuetify asks for it when the record is shown, when a box is left and when the record is saved). A value that
       * is wrong says so under the boxes; a required length that is missing does not (the editor marks it after a failed save, and a
       * form that has not been touched is not red).
       * @returns {true|string}
       */
      rule () {
        const message = this.badInput ? this.$filters.translate('TL_INVALID_DURATION') : validateDuration(this.schema, this._value)
        this.message = this.badInput || !_.isNil(this._value) ? message || '' : ''
        return message || true
      }
    }
  }
</script>

<style lang="scss">
.duration-field {
  .duration-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-4);
  }
  .duration-unit {
    display: flex;
    align-items: center;
    gap: var(--cms-space-2);
    .v-text-field {
      width: 96px;
    }
    // a number box without the spin buttons: they are in the way and the keyboard does the work
    input[type=number] {
      appearance: textfield;
      -moz-appearance: textfield;
      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        margin: 0;
        appearance: none;
        -webkit-appearance: none;
      }
    }
  }
  .duration-suffix {
    color: var(--cms-text-muted);
    font-size: var(--cms-fs-sm);
  }
  .duration-error {
    margin-top: var(--cms-space-1);
    color: var(--cms-error);
    font-size: var(--cms-fs-sm);
  }
}
</style>
