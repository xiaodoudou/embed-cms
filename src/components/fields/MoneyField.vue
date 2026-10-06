<template>
  <div class="money-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }">
    <field-label :schema="schema" :disabled="disabled" :input-id="`${inputId}-amount`" />
    <div class="money-row">
      <div class="money-currency">
        <template v-if="!options.fixed">
          <label :id="`${inputId}-currency-label`" :for="`${inputId}-currency`" class="cms-visually-hidden">{{ $filters.translate('TL_CURRENCY') }}</label>
          <v-select
            :id="`${inputId}-currency`" :model-value="currency" :items="items" :name="`${schema.model}-currency`" hide-details
            :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :disabled="isDisabled" :readonly="isReadonly"
            @update:model-value="onCurrency" @update:focused="onFieldFocus"
          />
        </template>
        <span v-else class="money-fixed" :title="currencyName(currency, tag)">{{ currency }}</span>
      </div>
      <v-text-field
        :id="`${inputId}-amount`" ref="input" :model-value="text" :name="`${schema.model}-amount`" type="text" inputmode="decimal" autocomplete="off" hide-details
        :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :error="!!message" :rules="[rule]" validate-on="blur"
        :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
        class="money-amount" @update:model-value="onInput" @focus="selectAll" @blur="onBlur" @update:focused="onFieldFocus"
      />
    </div>
    <div v-if="message" class="money-error" role="alert">{{ message }}</div>
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
  import { currencyName, formatAmountInput, moneyOptions, normaliseMoney, parseAmount, roundAmount, validateAmountText } from '@u/money'

  /**
   * An amount in a currency. The value is `{ amount, currency }`, in the major unit of the currency and with the decimals it has, or nothing
   * when the amount box is empty (a currency without an amount is no value). A fixed currency is written beside the box; several are chosen.
   */
  export default {
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // what is typed in the amount box (text, so that an empty box stays empty and a half-typed number stays as typed)
        text: '',
        // the currency chosen, kept while there is no amount
        currency: '',
        // what is wrong with the value, shown under the boxes
        message: '',
        // the box holds what is not an amount
        badInput: false
      }
    },
    computed: {
      /** @returns {{currencies: string[], fixed: boolean, min: number|undefined, max: number|undefined}} what the field says */
      options () {
        return moneyOptions(this.schema)
      },
      /** @returns {Object|undefined} the value of the record when it is an amount in a currency */
      current () {
        return normaliseMoney(_.get(this.model, this.schema.model))
      },
      /** @returns {string} the tag of the language of the admin */
      tag () {
        return localeTag(TranslateService.locale)
      },
      /** @returns {Array<Object>} the currencies to choose from, with their names (one a record holds that the field does not list is kept in the list) */
      items () {
        const codes = this.currency && !_.includes(this.options.currencies, this.currency) ? [...this.options.currencies, this.currency] : this.options.currencies
        return _.map(codes, code => ({ value: code, title: code, props: { subtitle: currencyName(code, this.tag) } }))
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
        const typed = this.typedValue()
        if (!(_.isEqual(typed, value) || (_.isUndefined(typed) && _.isUndefined(value)))) {
          this.showValue()
        }
      }
    },
    created () {
      this.showValue()
    },
    methods: {
      currencyName,
      /** Fills the boxes from the value. */
      showValue () {
        const value = this.current
        this.currency = value ? value.currency : this.currency && _.includes(this.options.currencies, this.currency) ? this.currency : this.options.currencies[0]
        this.text = value ? formatAmountInput(value.amount, value.currency, this.tag) : ''
        this.badInput = false
      },
      /** @returns {{amount: number, currency: string}|undefined} what the boxes make: nothing when the amount is empty or is not an amount */
      typedValue () {
        const amount = parseAmount(this.text, this.tag)
        return _.isFinite(amount) ? { amount: roundAmount(amount, this.currency), currency: this.currency } : undefined
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
        return validateAmountText(this.schema, this.text, this.currency) || ''
      },
      /** @param {string|null} text what was typed in the amount box */
      onInput (text) {
        if (this.isLocked()) {
          return
        }
        this.text = _.isNil(text) ? '' : String(text)
        this.badInput = _.isNaN(parseAmount(this.text, this.tag))
        this.emitValue()
      },
      /** @param {string} code the currency chosen: the amount takes the decimals of the new currency */
      onCurrency (code) {
        if (this.isLocked() || !code) {
          return
        }
        this.currency = code
        const amount = parseAmount(this.text, this.tag)
        if (_.isFinite(amount)) {
          this.text = formatAmountInput(roundAmount(amount, code), code, this.tag)
        }
        this.emitValue()
      },
      /** @param {FocusEvent} event a box that is entered has its number selected, so that typing replaces it */
      selectAll (event) {
        if (event.target && event.target.select) {
          event.target.select()
        }
      },
      /** Leaving the amount box: it is written with the decimals of the currency (19.5 is 19.50), and the value is checked. */
      onBlur () {
        const amount = parseAmount(this.text, this.tag)
        if (_.isFinite(amount)) {
          this.text = formatAmountInput(roundAmount(amount, this.currency), this.currency, this.tag)
        }
        this.message = this.check()
      },
      /**
       * The rule of the form (Vuetify asks for it when the record is shown, when the box is left and when the record is saved). A value
       * that is wrong says so under the boxes; an amount that is missing and required does not (the editor marks it after a failed
       * save, and a form that has not been touched is not red).
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
.money-field {
  .money-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-4);
  }
  .money-currency {
    width: 120px;
  }
  // a fixed currency: its code beside the amount, not a control
  .money-fixed {
    width: 100%;
    padding: 0 var(--cms-space-2);
    border: 0;
    background: transparent;
    color: var(--cms-text-muted);
    font: inherit;
    font-weight: 500;
    outline: none;
  }
  .money-amount {
    flex: 1 1 160px;
    max-width: 280px;
    input {
      font-variant-numeric: tabular-nums;
    }
  }
  .money-error {
    margin-top: var(--cms-space-1);
    color: var(--cms-error);
    font-size: var(--cms-fs-sm);
  }
}
</style>
