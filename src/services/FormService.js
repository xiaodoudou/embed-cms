
import _ from 'lodash'
import TranslateServiceLib from '@s/TranslateService'
import { ratingOptions, normaliseRating } from '@u/rating'
import { validateDuration } from '@u/duration'

const TranslateService = window.TranslateService || TranslateServiceLib
/**
 * @param {Object} schema
 * @returns {{key: string, locale?: string}} the field name and the locale of the model path
 */
const getKeyLocale = (schema) => {
  const options = {}
  const list = _.get(schema, 'model', '').split('.')
  if (_.get(schema, 'localised', false)) {
    options.locale = list.pop()
  }
  options.key = list.join('.')
  return options
}

/**
 * @param {string} email
 * @returns {boolean|Array} empty passes; else the match
 */
const validateEmail = (email) => {
  return _.isUndefined(email) || String(email).length === 0 || String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )
}

const validators = {
  /**
   * @param {string} u
   * @returns {boolean}
   */
  url: (u) => {
    try {
      const validUrl = new URL(u)
      return !!validUrl
    } catch {
      return false
    }
  },
  /**
   * @param {*} n
   * @returns {boolean}
   */
  number: (n) => _.isNumber(n),
  /**
   * @param {*} n
   * @returns {boolean}
   */
  integer: (n) => _.isNumber(n) && _.isInteger(n),
  /**
   * @param {*} n
   * @returns {boolean}
   */
  double: (n) => _.isNumber(n) && (_.isInteger(n) || (n === +n && n !== (n | 0))),
  /**
   * @param {*} t
   * @returns {boolean}
   */
  text: (t) => _.isString(t),
  /**
   * @param {*} a
   * @returns {boolean}
   */
  array: (a) => _.isArray(a),
  /**
   * @param {*} e
   * @returns {boolean|Array}
   */
  email: (e) => validateEmail(e)
}

/** @returns {string} the translated message */
const fieldIsRequired = () => {
  return TranslateService.get('TL_FIELD_IS_REQUIRED')
}
/** @returns {string} the translated message */
const invalidFormat = () => {
  return TranslateService.get('TL_INVALID_FORMAT')
}

/**
 * @param {Object} field
 * @param {*} value
 * @param {Object} model
 * @param {string} type number, integer or double
 * @returns {true|string}
 */
const checkNumber = (field, value, model, type) => {
  if (_.get(field, 'required', false) && !_.isNumber(value)) {
    return TranslateService.get('TL_FIELD_IS_REQUIRED')
  }
  const func = _.get(validators, type, false)
  if (func) {
    return func(Number(value || 0), field, model, {
      fieldIsRequired: fieldIsRequired(),
      invalidFormat: invalidFormat()
    })
  }
  console.error(`checkNumber - No validator found for type '${type}'`)
  return false
}

/**
 * @param {*} item
 * @param {Object} labelProp labels by value
 * @returns {string}
 */
const customLabel = (item, labelProp) => {
  return _.get(labelProp, item, item)
}

const customValidators = {
  /**
   * @param {*} value seconds
   * @param {Object} field
   * @returns {true|string}
   */
  duration: (value, field) => validateDuration(field, value) || true,
  /**
   * @param {*} value
   * @param {Object} field
   * @returns {true|string} a rating is a number from 1 (0.5 with half steps) to the most the field says, or nothing
   */
  rating: (value, field) => {
    if (_.isNil(value) || value === '') {
      return _.get(field, 'required', false) ? fieldIsRequired() : true
    }
    const { max, half } = ratingOptions(field)
    return _.isFinite(value) && normaliseRating(value, max, half) === value ? true : TranslateService.get('TL_INVALID_RATING', { max })
  },
  /**
   * @param {*} a
   * @returns {boolean}
   */
  array: (a) => _.isArray(a),
  /**
   * @param {*} e
   * @returns {boolean}
   */
  email: (e) => (new RegExp('/^\\w+([\\.-]?\\w+)*@\\w+([\\.-]?\\w+)*(\\.\\w{2,3})+$/')).test(e),
  /**
   * @param {*} value
   * @param {Object} field
   * @returns {true|string}
   */
  text: (value, field) => {
    if (_.get(field, 'required', false) && (!_.isString(value) || _.isEmpty(value))) {
      return fieldIsRequired()
    }
    const locale = _.head(_.get(field, 'model', '').split('.'))
    if (_.get(field, 'regex.value', false) === false && _.get(field, `regex['${locale}'].value`, false) === false) {
      return true
    }
    let regexText = false
    let regexDescription = false
    if (field.localised && locale) {
      regexText = _.get(field, `regex['${locale}'].value`, false)
      regexDescription = _.get(field, `regex['${locale}'].description`, false)
    }
    if (regexText === false) {
      regexText = _.get(field, 'regex.value', false)
      regexDescription = _.get(field, 'regex.description', false)
    }
    if (regexDescription === false) {
      regexDescription = regexText
    }
    if (regexText && _.isString(regexText)) {
      const fragments = regexText.match(/\/(.*?)\/([gimy])?$/)
      // a pattern is written /text/flags; plain text is taken as the pattern itself
      const regex = new RegExp(fragments ? fragments[1] : regexText, fragments ? (fragments[2] || '') : '')
      if (!regex.test(value)) {
        return `${invalidFormat()} (${TranslateService.get(regexDescription)})`
      }
    }
    return true
  },
  /**
   * @param {*} value
   * @param {Object} field
   * @returns {true|string} an empty paragraph counts as empty
   */
  wysiwyg: (value, field) => {
    if (_.get(field, 'required', false) && (!_.isString(value) || _.isEmpty(value)) || value === '<p></p>') {
      return fieldIsRequired()
    }
    return true
  },
  /**
   * @param {*} value
   * @param {Object} field
   * @param {Object} model
   * @returns {true|string}
   */
  number: (value, field, model) => checkNumber(field, value, model, 'number'),
  /**
   * @param {*} value
   * @param {Object} field
   * @param {Object} model
   * @returns {true|string}
   */
  double: (value, field, model) => checkNumber(field, value, model, 'double'),
  /**
   * @param {*} value
   * @param {Object} field
   * @param {Object} model
   * @returns {true|string}
   */
  integer: (value, field, model) => {
    if (_.isNil(value)) {
      value = ''
    }
    if (value.toString().indexOf('.') !== -1) {
      return false
    }
    return checkNumber(field, value, model, 'integer')
  },
  /**
   * @param {*} value
   * @param {Object} field
   * @param {Object} model the record, where the attachment of the field is looked up
   * @returns {true|string}
   */
  image: (value, field, model) => {
    const { key, locale } = getKeyLocale(field)
    const attachment = _.find(_.get(model, '_attachments', []), (item) => {
      return item._name === key && (!locale || item._fields.locale === locale)
    })
    if (_.get(field, 'required', false) && !attachment && _.get(value, 'length', 0) === 0) {
      return fieldIsRequired()
    }
    return true
  },
  /**
   * @param {*} value
   * @param {Object} field
   * @param {Object} model the record, where the attachment of the field is looked up
   * @returns {true|string}
   */
  file: (value, field, model) => {
    const { key, locale } = getKeyLocale(field)
    const attachment = _.find(_.get(model, '_attachments', []), (item) => {
      return item._name === key && (!locale || item._fields.locale === locale)
    })
    if (_.get(field, 'required', false) && !attachment) {
      return fieldIsRequired()
    }
    return true
  },
  /**
   * @param {*} value
   * @param {Object} field
   * @returns {true|string}
   */
  select: (value, field) => {
    return _.get(field, 'required', false) && _.isEmpty(value) ? fieldIsRequired() : true
  },
  /**
   * @param {*} value
   * @param {Object} field
   * @returns {true|string}
   */
  pillbox: (value, field) => {
    if (_.get(field, 'required', false) && (!_.isArray(value) || _.isEmpty(value))) {
      return fieldIsRequired()
    }
    return true
  }
}

const typeMapper = {
  string: {
    type: 'input',
    overrideType: 'CustomInput',
    validator: customValidators.text
  },
  transliterate: {
    type: 'input',
    overrideType: 'Transliterate',
    validator: customValidators.text
  },
  text: {
    type: 'textarea',
    overrideType: 'CustomTextarea',
    rows: 5,
    validator: customValidators.text
  },
  password: {
    type: 'input',
    inputFieldType: 'password',
    overrideType: 'CustomInput'
  },
  email: {
    type: 'input',
    overrideType: 'CustomInput',
    // a plain text box, neither type="email" nor inputmode="email": both make Brave offer an email alias
    validator: validators.email
  },
  url: {
    type: 'input',
    overrideType: 'CustomInput',
    validator: validators.url
  },
  number: {
    type: 'input',
    overrideType: 'CustomInput',
    inputFieldType: 'number',
    validator: customValidators.number
  },
  double: {
    type: 'input',
    overrideType: 'CustomInput',
    inputFieldType: 'number',
    validator: customValidators.double
  },
  integer: {
    type: 'input',
    overrideType: 'CustomInput',
    inputFieldType: 'number',
    validator: customValidators.integer
  },
  checkbox: {
    type: 'switch',
    overrideType: 'CustomCheckbox'
  },
  date: {
    type: 'CustomDatetimePicker',
    format: 'YYYY-MM-DD',
    customDatetimePickerOptions: {
      placeholder: 'YYYY-MM-DD'
    }
  },
  time: {
    type: 'CustomDatetimePicker',
    format: 'HH:mm:ss',
    customDatetimePickerOptions: {
      placeholder: 'HH:mm:ss'
    }
  },
  datetime: {
    type: 'CustomDatetimePicker',
    format: 'YYYY-MM-DD HH:mm:ss',
    customDatetimePickerOptions: {
      placeholder: 'YYYY-MM-DD HH:mm:ss'
    }
  },
  pillbox: {
    type: 'CustomInputTag',
    selectOptions: {
      multiple: true,
      searchable: true,
      /**
       * @param {string} newTag
       * @param {string} id
       * @param {Array} options receives it
       * @param {Array} value receives it
       */
      onNewTag (newTag, id, options, value) {
        options.push(newTag)
        value.push(newTag)
      }
    },
    values: [],
    validator: customValidators.pillbox
  },
  select: {
    type: 'CustomMultiSelect',
    selectOptions: {
      multiple: false,
      trackBy: '_id',
      customLabel,
      searchable: true
    },
    validator: customValidators.select
  },
  multiselect: {
    type: 'CustomMultiSelect',
    selectOptions: {
      multiple: true,
      listBox: true,
      trackBy: '_id',
      chips: true,
      deletableChips: true,
      customLabel,
      searchable: true
    },
    validator: validators.array
  },
  json: {
    type: 'TreeView',
    overrideType: 'CustomTreeView',
    treeViewOptions: {
      maxDepth: 4,
      rootObjectKey: 'root',
      modifiable: false
    }
  },
  code: {
    type: 'Code',
    overrideType: 'CustomCode',
    options: {
    }
  },
  wysiwyg: {
    type: 'Wysiwyg',
    overrideType: 'WysiwygField',
    validator: customValidators.wysiwyg
  },
  image: {
    type: 'ImageView',
    validator: customValidators.image
  },
  // an image field with the crop tool (see utils/cropRecipe.js): the same component, which shows the tool when the input is cropimage
  cropimage: {
    type: 'ImageView',
    validator: customValidators.image
  },
  // an image field with an image map: the areas laid over the picture, each with a title and a link (see utils/imageMap.js)
  imagemap: {
    type: 'ImageView',
    validator: customValidators.image
  },
  file: {
    type: 'AttachmentView',
    validator: customValidators.file
  },
  paragraph: {
    type: 'ParagraphView'
  },
  group: {
    type: 'group',
    overrideType: 'Group'
  },
  object: {
    type: 'JsonEditor'
  },
  // a length of time, typed in hours and minutes (or the units the field says) and kept in seconds (see utils/duration.js)
  duration: {
    type: 'DurationField',
    validator: customValidators.duration
  },
  // a number of icons filled up to the value (see utils/rating.js)
  rating: {
    type: 'RatingField',
    validator: customValidators.rating
  },
  color: {
    type: 'ColorPicker',
    colorPickerOptions: {
    }
  }
}

_.each(typeMapper, (type) => {
  type.density = 'compact'
  type.rounded = true
  type.flat = true
  _.set(type, 'solo-filled', true)
})

class FormService {
  constructor () {
    this.typeMapper = typeMapper
  }

  /**
   * @param {Object} schema
   * @returns {{key: string, locale?: string}}
   */
  getKeyLocale (schema) {
    return getKeyLocale(schema)
  }
}

export default new FormService()
