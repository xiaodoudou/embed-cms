<template>
  <div class="date-picker-wrapper" :class="{'is-readonly': isReadonly, 'is-disabled': isDisabled}">
    <field-label :schema="schema" :disabled="disabled" />
    <div class="date-row">
      <div class="date-control">
        <date-picker
          ref="input"
          v-model="_value"
          class="date-picker" :dark="theme === 'dark'"
          :time-config="timeConfig"
          :time-picker="!enableDatePicker && enableTimePicker"
          :ui="{ dayClass: getDayClass }"
          :formats="{ input: formatDateSelection }"
          :text-input="textInput"
          :placeholder="placeholder"
          :locale="locale"
          :input-attrs="{ clearable: !isLocked }"
          :readonly="isReadonly"
          :disabled="isDisabled"
          :aria-labels="{input: schema.label}"
          model-type="timestamp"
          @focus="onFieldFocus(true)" @blur="onFieldFocus(false)"
        />
      </div>
      <v-btn v-if="enableTimePicker && !isLocked" class="date-now" variant="outlined" size="small" @click="setNow">{{ $filters.translate('TL_NOW') }}</v-btn>
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
  import Dayjs from 'dayjs'
  import { toDateFnsFormat } from '@u/dateFormat'
  import { datePickerLocale } from '@u/locale'
  import TranslateService from '@s/TranslateService'

  export default {
    mixins: [AbstractField],
    props: {
      theme: { type: String, default: 'default' },
      options: { type: Object, default: () => ({}) },
      customDatetimePickerOptions: { type: Object, default: () => ({}) }
    },
    computed: {
      placeholder() {
        const placeholder = _.get(this.schema, 'customDatetimePickerOptions.placeholder', false)
        if (!placeholder) {
          console.warn(`No placeholder found in customDatetimePickerOptions for field ${this.schema.model}, will default to 'YYYY-MM-DD'`)
          return 'YYYY-MM-DD'
        }
        return placeholder
      },
      // date, time or datetime. The schema a field is given names its input; a field is also looked up in the schema of its
      // resource, which does not hold the fields inside a block of a blocks field (there the lookup used to find nothing, and
      // the field failed to render)
      fieldType() {
        const own = _.get(this.schema, 'input', false)
        if (_.isString(own) && own) {
          return own
        }
        const resourceSchema = _.get(this.schema, 'resource.schema', [])
        const foundField = _.find(resourceSchema, {field: this.schema.originalModel})
        if (foundField) {
          return _.get(foundField, 'input', 'date')
        }
        console.error(`Couldn't find field ${this.schema.originalModel} in resource schema, will show a date`, resourceSchema)
        return 'date'
      },
      enableTimePicker() {
        return this.fieldType.indexOf('time') !== -1
      },
      enableDatePicker() {
        return this.fieldType.indexOf('date') !== -1
      },
      isReadonly () {
        return !!this.schema.readonly
      },
      isDisabled () {
        return !!(this.disabled || this.schema.disabled)
      },
      isLocked () {
        return this.isReadonly || this.isDisabled
      },
      // typing and picking both work: typed text is parsed with the schema format
      textInput () {
        return { format: toDateFnsFormat(this.schema.format), enterSubmit: true, tabSubmit: true, selectOnFocus: true, openMenu: 'toggle' }
      },
      // the time part: whether there is one, whether it is next to the calendar, and what it counts (minutes, seconds)
      timeConfig () {
        return {
          enableTimePicker: this.enableTimePicker,
          timePickerInline: this.enableDatePicker && this.enableTimePicker,
          enableMinutes: this.isInFormat('mm'),
          enableSeconds: this.isInFormat('ss')
        }
      },
      // the language of the person, not the language of the field they edit: a calendar in Chinese is for someone who reads Chinese
      locale() {
        return datePickerLocale(TranslateService.locale)
      }
    },
    created () {
      this.schema.format = _.get(this.schema, 'format', 'YYYY/MM/DD h:i:s')
    },
    methods: {
      setNow () {
        this._value = Date.now()
      },
      isInFormat(toFind) {
        return this.schema.format.indexOf(toFind) !== -1
      },
      getDayClass (date) {
        const tomorrow = Dayjs().startOf('day').add(1, 'day')
        if (Dayjs(date).isSame(tomorrow, 'day'))
          return 'marked-cell'
        return ''
      },
      formatDateSelection (date) {
        return Dayjs(date).format(this.schema.format)
      }
    }
  }
</script>

<style lang="scss">
.date-picker-wrapper {
  .date-row {
    display: flex;
    align-items: center;
    gap: var(--cms-space-2);
    margin-top: var(--cms-space-1);
  }

  .date-control {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
  }

  .date-now {
    flex: 0 0 auto;
  }

  // the field states are the same as every other control (see base.scss)
  .dp--input {
    height: var(--cms-field-h);
    padding-top: 0;
    padding-bottom: 0;
    border: 1px solid var(--cms-border-strong);
    border-radius: var(--cms-radius-md);
    background-color: var(--cms-field-bg);
    color: var(--cms-text);
    font-family: var(--cms-font-sans);
    font-size: var(--cms-fs-base);
    transition: border-color var(--cms-motion-fast) var(--cms-ease), box-shadow var(--cms-motion-fast) var(--cms-ease);

    &::placeholder {
      color: var(--cms-text-muted);
      opacity: 1;
    }

    &:hover {
      border-color: var(--cms-text-muted);
    }

    &:focus,
    &.dp--input-focus {
      border-color: var(--cms-primary);
      box-shadow: 0 0 0 3px var(--cms-field-ring);
      outline: none;
    }
  }

  .dp--input-icon {
    color: var(--cms-text-muted);
  }

  &.is-readonly .dp--input {
    border-color: transparent;
    background-color: var(--cms-field-readonly-bg);
    cursor: default;
    padding-right: 36px;
    &:focus {
      border-color: var(--cms-primary);
    }
  }

  &.is-disabled .dp--input {
    border: 1px dashed var(--cms-border-strong);
    background-color: var(--cms-field-disabled-bg);
    color: var(--cms-text-muted);
    cursor: not-allowed;
    opacity: 1;
  }
}

// The popup is attached to the page, outside the field, so the colours are defined for both: the field and the popup
.date-picker,
.dp--theme-light,
.dp--theme-dark {
  border-radius: var(--cms-radius-md);
  --dp-border-radius: var(--cms-radius-md);
  --dp-input-padding: 0 30px 0 12px;
  --dp-font-family: var(--cms-font-sans);
  --dp-font-size: var(--cms-fs-base);
  --dp-background-color: var(--cms-surface);
  --dp-text-color: var(--cms-text);
  --dp-hover-color: var(--cms-surface-2);
  --dp-hover-text-color: var(--cms-text);
  --dp-hover-icon-color: var(--cms-text-muted);
  --dp-primary-color: var(--cms-primary);
  --dp-primary-disabled-color: var(--cms-primary-soft);
  --dp-primary-text-color: var(--cms-on-primary);
  --dp-secondary-color: var(--cms-border-strong);
  --dp-border-color: var(--cms-border-strong);
  --dp-menu-border-color: var(--cms-border);
  --dp-border-color-hover: var(--cms-text-muted);
  --dp-border-color-focus: var(--cms-primary);
  --dp-disabled-color: var(--cms-surface-3);
  --dp-disabled-color-text: var(--cms-text-muted);
  --dp-scroll-bar-background: var(--cms-surface-2);
  --dp-scroll-bar-color: var(--cms-border-strong);
  --dp-success-color: var(--cms-success);
  --dp-success-color-disabled: var(--cms-success-soft);
  --dp-icon-color: var(--cms-text-muted);
  --dp-danger-color: var(--cms-error);
  --dp-marker-color: var(--cms-error);
  --dp-tooltip-color: var(--cms-surface-2);
  --dp-highlight-color: var(--cms-primary-soft);
  --dp-range-between-dates-background-color: var(--cms-primary-soft);
  --dp-range-between-dates-text-color: var(--cms-on-primary-soft);
  --dp-range-between-border-color: var(--cms-primary-soft);
}

// the popup follows the dropdown style: same surface, radius and elevation
.dp--menu {
  border-radius: var(--cms-radius-md);
  box-shadow: var(--cms-shadow-2);
  font-family: var(--cms-font-sans);
}

.dp--action-button {
  border-radius: var(--cms-radius-md);
  font-weight: var(--cms-fw-medium);
}

// Select is the primary button, Cancel the secondary (outlined) one, as everywhere else
.dp--action-select {
  background: var(--cms-primary);
  color: var(--cms-on-primary);
  border: 1px solid var(--cms-primary);
  &:hover {
    background: var(--cms-primary-hover);
    border-color: var(--cms-primary-hover);
  }
}

.dp--action-cancel {
  background: transparent;
  color: var(--cms-primary);
  border: 1px solid var(--cms-border-strong);
  &:hover {
    background: var(--cms-primary-soft);
    border-color: var(--cms-primary);
  }
}
</style>
