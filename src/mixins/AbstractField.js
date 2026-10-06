import { get as objGet, set as objSet, join, forEach, isFunction, isString, isArray, uniq as arrayUniq, includes } from 'lodash'
import validators from '@u/validators'
import FieldSelectorService from '@s/FieldSelectorService'
import { validateFieldValue } from '@u/fieldValidation'
import { nameUnnamedInputs } from '@u/formAttrs'

/**
 * @param {string|Function} validator a name in validators, or a function
 * @returns {Function|undefined} a wrong name is logged
 */
function convertValidator (validator) {
  if (isString(validator)) {
    if (isFunction(validators[validator])) return validators[validator]
    else {
      console.warn(`'${validator}' is not a validator function!`)
      return null // caller need to handle null
    }
  }
  return validator
}

// What password managers look at to decide that a field is a credential to fill or save. The fields of a record are
// content (an email address of a customer, a token of a plugin...), never the login of the person editing.
const PASSWORD_MANAGER_OFF = {
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  autocomplete: 'off'
}

// An invalid token is what stops the suggestions: browsers ignore "off" for what they guess is an email or an address, and
// Brave offers an email alias on any text field it takes for a sign-up form (an email, a link or a name next to a password).
function autocompleteToken (input) {
  return input.type === 'password' ? 'new-password' : 'nope'
}

export default {
  emits: ['input', 'validated'],
  props: ['model', 'schema', 'formOptions', 'disabled', 'focused', 'paragraphLevel', 'paragraphIndex', 'theme'],
  data () {
    return {
      errors: []
    }
  },
  watch: {
    focused () {
      if (this.focused === -1) {
        return
      }
      const elem = objGet(this.$refs, 'input', false)
      const fieldType = objGet(this.schema, 'type', false)
      if (!elem && !includes(['Wysiwyg', 'ImageView', 'AttachmentView', 'switch'], fieldType)) {
        return console.error('no input ref for ', fieldType, this.schema)
      }
      if (!isFunction(objGet(elem, 'focus'))) {
        return
      }
      if (this.focused) {
        elem.focus()
      }
    }
  },
  computed: {
    /** @returns {string} an id for the input of the field, so the label before it can point at it (and Vuetify's aria-labelledby at the label) */
    inputId () {
      return `cms-field-${this.$.uid}`
    },
    _value: {
      cache: false,
      /** @returns {*} the value of the field, through schema.get when there is one */
      get () {
        return isFunction(objGet(this.schema, 'get')) ? this.schema.get(this.model) : objGet(this.model, this.schema.model)
      },
      /** @param {*} newValue */
      set (newValue) {
        const oldValue = this._value
        if (isFunction(newValue)) {
          newValue(newValue, oldValue)
        } else {
          this.updateModelValue(newValue, oldValue)
        }
      }
    }
  },
  mounted () {
    // Vuetify puts data-* attributes on the wrapper, not on the input: set them on the inputs themselves
    this.$nextTick(this.keepPasswordManagersOut)
    this.$nextTick(this.nameInputs)
  },
  updated () {
    // a widget draws its inputs when it likes (a code editor once it is ready, a file box when the field is unlocked)
    this.nameInputs()
  },
  methods: {
    /** Names the inputs of the widgets inside the field that have no id nor name (see formAttrs). */
    nameInputs () {
      nameUnnamedInputs(this.$el, this.schema && this.schema.model)
    },
    /** Marks the inputs so password managers leave them alone. */
    keepPasswordManagersOut () {
      const root = this.$el
      if (!root || !root.querySelectorAll) {
        return
      }
      root.querySelectorAll('input, textarea').forEach((input) => {
        Object.entries(PASSWORD_MANAGER_OFF).forEach(([name, value]) => {
          // a password field asks for a new password, which is what stops the fill suggestion
          input.setAttribute(name, name === 'autocomplete' ? autocompleteToken(input) : value)
        })
      })
    },
    // the rules of a text input: what the field's validation says, or true
    validateField (val) {
      return validateFieldValue(this.schema, val) || true
    },
    // disabled or read-only: shown, not editable
    isLocked () {
      return !!(this.disabled || objGet(this.schema, 'disabled') || objGet(this.schema, 'readonly'))
    },
    /** @returns {boolean} a hint and no error */
    showHint() {
      return objGet(this.schema, 'options.hint') && !this.errors.length
    },
    /** @param {boolean} focused losing it clears the paragraph highlight */
    onFieldFocus(focused) {
      if (!focused) {
        return FieldSelectorService.highlightParagraph(-1, -1)
      }
      FieldSelectorService.highlightParagraph(this.paragraphLevel - 1, this.paragraphIndex)
    },
    /**
     * @param {string} key a path in the schema
     * @param {*} defaultVal
     * @returns {*}
     */
    get (key, defaultVal = false) {
      return objGet(this.schema, key, defaultVal)
    },
    /**
     * @param {string} opt a key of schema.options
     * @param {*} defaultVal
     * @returns {*}
     */
    getOpt (opt, defaultVal) {
      return objGet(this.schema, `options.${opt}`, defaultVal)
    },
    /** @returns {string|undefined} the Vuetify variant named in the schema */
    getVariant () {
      const variant = []
      forEach(['underlined', 'outlined', 'filled', 'solo', 'solo-inverted', 'solo-filled', 'plain'], (key) => {
        if (this.get(key)) {
          variant.push(key)
        }
      })
      return join(variant, ' ')
    },
    /** @param {*} data */
    onChangeData (data) {
      this._value = data
    },
    /**
     * @param {boolean} calledParent
     * @returns {Promise<Array<string>>} the errors
     */
    async validate (calledParent) {
      this.clearValidationErrors()
      const validateAsync = objGet(this.formOptions, 'validateAsync', false)
      let results = []
      if (this.schema.validator && this.schema.readonly !== true && this.disabled !== true) {
        const validators = []
        if (!isArray(this.schema.validator)) {
          validators.push(convertValidator(this.schema.validator).bind(this))
        } else {
          forEach(this.schema.validator, validator => {
            validators.push(convertValidator(validator).bind(this))
          })
        }
        forEach(validators, validator => {
          if (validateAsync) {
            results.push(validator(this._value, this.schema, this.model))
          } else {
            const result = validator(this._value, this.schema, this.model)
            if (result && isFunction(result.then)) {
              result.then(err => {
                if (err) {
                  this.errors = this.errors.concat(err)
                }
                const isValid = this.errors.length === 0
                this.$emit('validated', isValid, this.errors, this)
              })
            } else if (result) {
              results = results.concat(result)
            }
          }
        })
      }
      const handleErrors = (errors) => {
        let fieldErrors = []
        forEach(arrayUniq(errors), err => {
          if (isArray(err) && err.length > 0) {
            fieldErrors = fieldErrors.concat(err)
          } else if (isString(err)) {
            fieldErrors.push(err)
          }
        })
        if (isFunction(this.schema.onValidated)) {
          this.schema.onValidated.call(this, this.model, fieldErrors, this.schema)
        }
        const isValid = fieldErrors.length === 0
        if (!calledParent) {
          this.$emit('validated', isValid, fieldErrors, this)
        }
        this.errors = fieldErrors
        return fieldErrors
      }
      if (!validateAsync) {
        return handleErrors(results)
      }
      return Promise.all(results).then(handleErrors)
    },
    /**
     * @param {*} newValue
     * @param {*} oldValue
     */
    async updateModelValue (newValue, oldValue) {
      let changed = false
      if (isFunction(this.schema.set)) {
        this.schema.set(this.model, newValue)
        changed = true
      } else if (this.schema.model) {
        objSet(this.model, this.schema.model, newValue)
        changed = true
      }
      if (changed) {
        if (isFunction(this.schema.onChanged)) {
          this.schema.onChanged.call(this, this.model, newValue, oldValue, this.schema)
        }
        if (objGet(this.formOptions, 'validateAfterChanged', false) === true) {
          await this.validate()
        }
        this.$emit('input', newValue, this.schema.model)
      }
    },
    clearValidationErrors () {
      this.errors.splice(0)
    },
    /** @returns {{key: string, locale?: string}} the field name and the locale of the model path */
    getKeyLocale () {
      const options = {}
      const list = this.schema.model.split('.')
      if (this.schema.localised) {
        options.locale = list.pop()
      }
      options.key = list.join('.')
      return options
    },
    /** @returns {Array<string>} schema.fieldClasses */
    getFieldClasses () {
      return objGet(this.schema, 'fieldClasses', [])
    }
  }
}
