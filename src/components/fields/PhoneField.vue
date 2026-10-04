<template>
  <div class="phone-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" :input-id="`${inputId}-number`" />
    <div class="phone-row">
      <div class="phone-country">
        <label :id="`${inputId}-country-label`" :for="`${inputId}-country`" class="cms-visually-hidden">{{ $filters.translate('TL_COUNTRY') }}</label>
        <v-autocomplete
          :id="`${inputId}-country`" :model-value="iso" :items="items" :name="`${schema.model}-country`" :custom-filter="matches" hide-details auto-select-first
          :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :disabled="isDisabled" :readonly="isReadonly || options.countries.length === 1"
          menu-icon="$chevronDown" @update:model-value="onCountry" @update:focused="onFieldFocus"
        >
          <template #selection="{ item }">
            <span class="phone-selected"><span class="phone-flag" aria-hidden="true">{{ item.flag }}</span>{{ item.code }}</span>
          </template>
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :title="undefined" :subtitle="undefined">
              <span class="phone-option"><span class="phone-flag" aria-hidden="true">{{ item.flag }}</span><span class="phone-name">{{ item.name }}</span><span class="phone-code">{{ item.code }}</span></span>
            </v-list-item>
          </template>
        </v-autocomplete>
      </div>
      <v-text-field
        :id="`${inputId}-number`" ref="input" :model-value="text" :name="`${schema.model}-number`" type="tel" inputmode="tel" autocomplete="off" hide-details
        :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :error="!!message" :rules="[rule]" validate-on="blur"
        :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
        class="phone-number" @update:model-value="onInput" @blur="onBlur" @update:focused="onFieldFocus"
      />
    </div>
    <div v-if="message" class="phone-error" role="alert">{{ message }}</div>
    <div v-else-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import TranslateService from '@s/TranslateService'
  import { localeTag } from '@u/locale'
  import { countryName, countryOf, flagOf, groupDigits, phoneOptions, readPhone, splitE164, toE164, validatePhoneText } from '@u/phone'

  /**
   * A telephone number: a country chosen from a list (with its flag and calling code) and the national number in a box. The value is the number
   * in the international form, `+442071838750`, or nothing when the box is empty. A number written with its country (`+44 20 7183 8750`)
   * is split into the two, and the 0 a national number starts with (020 7183 8750) is left out.
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // what is typed in the box (text, so that what is half typed stays as typed)
        text: '',
        // the country chosen, kept while there is no number
        iso: '',
        // what is wrong with the value, shown under the boxes
        message: '',
        // the box holds what is not a number
        badInput: false
      }
    },
    computed: {
      /** @returns {{countries: string[], country: string}} what the field says */
      options () {
        return phoneOptions(this.schema)
      },
      /** @returns {string|undefined} the value of the record when it is a text (an international number, or a value that is not one and is shown as it is) */
      current () {
        const value = _.get(this.model, this.schema.model)
        return _.isString(value) && value !== '' ? value : undefined
      },
      /** @returns {string} the tag of the language of the admin */
      tag () {
        return localeTag(TranslateService.locale)
      },
      /** @returns {Array<Object>} the countries to choose from, by name in the language of the admin (or in the order the field lists them) */
      items () {
        const items = _.map(this.options.countries, (iso) => {
          const name = countryName(iso, this.tag)
          const code = `+${countryOf(iso).dial}`
          return { value: iso, title: `${name} ${code}`, name, code, flag: flagOf(iso), search: `${name} ${iso} ${code}` }
        })
        return this.options.listed ? items : _.sortBy(items, item => item.name)
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
      current (value) {
        if (this.badInput) {
          return
        }
        if (this.typedValue() !== value) {
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
        const parts = splitE164(this.current)
        this.iso = parts ? parts.iso : _.includes(this.options.countries, this.iso) ? this.iso : this.options.country
        this.text = parts ? groupDigits(parts.national) : this.current || ''
        this.badInput = false
      },
      /** @returns {string|undefined} what the boxes make: nothing when the box is empty or is not a number */
      typedValue () {
        const read = readPhone(this.text, this.iso)
        return read ? toE164(read.iso, read.national) : undefined
      },
      /** Gives the value to the record. */
      emitValue () {
        this._value = this.typedValue()
        this.$emit('input', this._value, this.schema.model)
        if (this.message) {
          this.message = this.check()
        }
      },
      /** @returns {string} what is wrong with the boxes, empty when nothing */
      check () {
        return validatePhoneText(this.schema, this.text, this.iso) || ''
      },
      /** @param {string|null} text what was typed in the box */
      onInput (text) {
        if (this.isLocked()) {
          return
        }
        this.text = _.isNil(text) ? '' : String(text)
        const read = readPhone(this.text, this.iso)
        this.badInput = read === null
        // a number written with its country says which country it is
        if (read && read.iso !== this.iso && _.includes(this.options.countries, read.iso)) {
          this.iso = read.iso
        }
        this.emitValue()
      },
      /** @param {string} iso the country chosen: the number is kept as typed, in the new country */
      onCountry (iso) {
        if (this.isLocked() || !iso) {
          return
        }
        this.iso = iso
        this.emitValue()
      },
      /** @param {Object} value
       * @param {string} query what is typed in the list
       * @param {Object} item
       * @returns {boolean} the country is the one searched: by name, code of the country or calling code */
      matches (value, query, item) {
        return _.includes(_.toLower(_.get(item, 'raw.search', '')), _.toLower(_.trim(query)))
      },
      /** Leaving the box: the number is written in groups, and the value is checked. */
      onBlur () {
        const parts = splitE164(this.typedValue())
        if (parts) {
          this.iso = parts.iso
          this.text = groupDigits(parts.national)
        }
        this.message = this.check()
      },
      /**
       * The rule of the form (Vuetify asks for it when the record is shown, when the box is left and when the record is saved). A value that is
       * wrong says so under the boxes; a number that is missing and required does not (the editor marks it after a failed save, and a form that
       * has not been touched is not red).
       * @returns {true|string}
       */
      rule () {
        const message = this.check()
        this.message = _.trim(this.text) === '' ? '' : message
        return message || true
      }
    }
  }
</script>

<style lang="scss">
.phone-field {
  .phone-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-4);
  }
  .phone-country {
    width: 148px;
    // the search box of the list stays beside the country shown, not under it
    .v-autocomplete .v-field__input {
      flex-wrap: nowrap;
      input {
        min-width: 0;
        flex: 1 1 0;
      }
    }
  }
  .phone-number {
    flex: 1 1 200px;
    max-width: 320px;
    input {
      font-variant-numeric: tabular-nums;
    }
  }
  .phone-error {
    margin-top: var(--cms-space-1);
    color: var(--cms-error);
    font-size: var(--cms-fs-sm);
  }
}
// the list is in an overlay, outside the field
.phone-field,
.v-overlay__content .phone-option {
  .phone-flag {
    margin-right: var(--cms-space-2);
  }
}
.v-overlay__content .phone-option {
  display: flex;
  align-items: baseline;
  .phone-name {
    flex: 1 1 auto;
  }
  .phone-code {
    margin-left: var(--cms-space-3);
    color: var(--cms-text-muted);
    font-variant-numeric: tabular-nums;
  }
}
</style>
