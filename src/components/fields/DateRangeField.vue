<template>
  <div class="daterange-field date-picker-wrapper" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" />
    <div class="date-row">
      <div class="date-control">
        <date-picker
          ref="input"
          :model-value="pickerValue"
          class="date-picker" :dark="theme === 'dark'"
          :range="rangeConfig"
          :multi-calendars="true"
          :time-config="timeConfig"
          :min-date="options.minDate"
          :max-date="options.maxDate"
          :formats="{ input: formatInput }"
          :text-input="textInput"
          :placeholder="placeholder"
          :locale="locale"
          :input-attrs="{ clearable: !locked }"
          :readonly="isReadonly"
          :disabled="isDisabled"
          :aria-labels="{ input: schema.label }"
          model-type="timestamp"
          @update:model-value="onPick"
          @focus="onFieldFocus(true)" @blur="onFieldFocus(false)"
        />
      </div>
    </div>
    <div v-if="problem" class="daterange-error" role="alert">{{ problem }}</div>
    <div v-else-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import Dayjs from 'dayjs'
  import AbstractField from '@m/AbstractField'
  import TranslateService from '@s/TranslateService'
  import { dateRangeOptions, normaliseRange, validateDateRange } from '@u/dateRange'
  import { toDateFnsFormat } from '@u/dateFormat'
  import { datePickerLocale } from '@u/locale'

  const SEPARATOR = ' – '

  /**
   * A start and an end picked on one calendar. The value is `{ start, end }` in milliseconds, or nothing: a range is both or none (the calendar gives a range only when the
   * end is picked). A range of days has both at the start of their day, the last day being in the range; with options.time each is the moment picked.
   * The calendar does not let a day outside minDate and maxDate, or a range of fewer than minDays or more than maxDays days, be picked.
   */
  export default {
    mixins: [AbstractField],
    props: {
      theme: { type: String, default: 'default' }
    },
    emits: ['input'],
    computed: {
      /** @returns {Object} what the field says (see utils/dateRange.js) */
      options () {
        return dateRangeOptions(this.schema)
      },
      /** @returns {{start: number, end: number}|undefined} the value of the record when it is a range */
      current () {
        return normaliseRange(_.get(this.model, this.schema.model))
      },
      /** @returns {number[]|null} what the calendar shows */
      pickerValue () {
        return this.current ? [this.current.start, this.current.end] : null
      },
      /** @returns {Object} the range rules of the calendar */
      rangeConfig () {
        return { partialRange: false, minRange: this.options.minDays ? this.options.minDays - 1 : undefined, maxRange: this.options.maxDays ? this.options.maxDays - 1 : undefined, noDisabledRange: true }
      },
      /** @returns {Object} the time part: there is one only when the field says so */
      timeConfig () {
        return { enableTimePicker: this.options.time, timePickerInline: this.options.time, enableMinutes: true, enableSeconds: false }
      },
      /** @returns {Object} typing works as well as picking: typed text is read with the format of the field */
      textInput () {
        return { format: toDateFnsFormat(this.options.format), rangeSeparator: SEPARATOR, enterSubmit: true, tabSubmit: true, selectOnFocus: true, openMenu: 'toggle' }
      },
      /** @returns {string} what the box says before anything is picked */
      placeholder () {
        return `${this.options.format}${SEPARATOR}${this.options.format}`
      },
      /** @returns {Object} the language of the person, not the one of the content */
      locale () {
        return datePickerLocale(TranslateService.locale)
      },
      /** @returns {string} what is wrong with a range the record already holds (the calendar will not make one that is wrong) */
      problem () {
        const value = _.get(this.model, this.schema.model)
        return _.isNil(value) ? '' : validateDateRange(this.schema, value) || ''
      },
      /** @returns {boolean} */
      isReadonly () {
        return !!this.schema.readonly
      },
      /** @returns {boolean} the prop or the schema */
      isDisabled () {
        return !!(this.disabled || this.schema.disabled)
      },
      /** @returns {boolean} readonly or disabled */
      locked () {
        return this.isReadonly || this.isDisabled
      }
    },
    methods: {
      /**
       * @param {Date|Date[]|string} dates what the box shows
       * @returns {string} the two moments in the format of the field, with a dash between
       */
      formatInput (dates) {
        return _.join(_.map(_.compact(_.castArray(dates)), date => Dayjs(date).format(this.options.format)), SEPARATOR)
      },
      /**
       * @param {number[]|null} picked what the calendar gives: the start and the end, or nothing when it is cleared (it gives only the start while the end is being picked)
       */
      onPick (picked) {
        if (this.isLocked()) {
          return
        }
        if (_.isNil(picked) || (_.isArray(picked) && _.isEmpty(picked))) {
          this._value = undefined
        } else if (_.isArray(picked) && picked.length === 2 && _.every(picked, _.isFinite)) {
          const [first, second] = picked
          this._value = { start: Math.min(first, second), end: Math.max(first, second) }
        } else {
          return
        }
        this.$emit('input', this._value, this.schema.model)
      }
    }
  }
</script>

<style lang="scss">
.daterange-field {
  .daterange-error {
    margin-top: var(--cms-space-1);
    color: var(--cms-error);
    font-size: var(--cms-fs-sm);
  }
}
</style>
