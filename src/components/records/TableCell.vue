<template>
  <span v-if="kind === 'boolean'" class="cell-bool" :class="{on: !!value}" role="img" :aria-label="$filters.translate(value ? 'TL_YES' : 'TL_NO')">
    <v-icon size="16" :icon="value ? '$checkBold' : '$minus'" />
  </span>
  <span
    v-else-if="empty" class="cell-empty" role="img" :title="emptyLabel" :aria-label="emptyLabel"
  >&ndash;</span>
  <template v-else-if="kind === 'image'">
    <img v-if="imageSrc" class="cell-thumb" :src="imageSrc" alt="" loading="lazy" draggable="false">
    <span v-else class="cell-thumb placeholder" role="img" :aria-label="$filters.translate('TL_NO_IMAGE')"><v-icon size="16" icon="$imageOutline" /></span>
  </template>
  <template v-else-if="kind === 'multi'">
    <span class="cell-chips">
      <span v-for="chip in chips.shown" :key="chip" class="cell-chip" :title="chip">{{ chip }}</span>
      <span v-if="chips.more" class="cell-chip more" :title="chips.all.join(', ')">+{{ chips.more }}</span>
    </span>
  </template>
  <span v-else-if="kind === 'select'" class="cell-chips"><span class="cell-chip" :title="text" @mouseenter="titleIfClipped">{{ text }}</span></span>
  <template v-else-if="kind === 'link'">
    <a v-if="href" class="cell-link" :href="href" target="_blank" rel="noopener noreferrer" :title="text" tabindex="-1" @click.stop>{{ text }}</a>
    <span v-else class="cell-text" @mouseenter="titleIfClipped">{{ text }}</span>
  </template>
  <span v-else-if="kind === 'color'" class="cell-color"><span class="swatch" :style="{background: value}" /><span class="cell-text">{{ text }}</span></span>
  <span v-else-if="kind === 'file'" class="cell-file"><v-icon size="14" icon="$paperclip" /><span class="cell-text" @mouseenter="titleIfClipped">{{ text }}</span></span>
  <span v-else-if="kind === 'number'" class="cell-text cell-number">{{ text }}</span>
  <span v-else-if="kind === 'duration'" class="cell-text cell-number" :title="text">{{ text }}</span>
  <template v-else-if="kind === 'phone'">
    <a v-if="phoneHref" class="cell-link cell-number" :href="phoneHref" :title="text" tabindex="-1" @click.stop>{{ text }}</a>
    <span v-else class="cell-text cell-number">{{ text }}</span>
  </template>
  <span v-else-if="kind === 'money'" class="cell-text cell-number" :title="text">{{ text }}</span>
  <span v-else-if="kind === 'rating'" class="cell-rating" :title="text"><v-icon :icon="ratingIcon" size="14" /><span class="cell-text">{{ text }}</span></span>
  <span v-else-if="kind === 'date' || kind === 'datetime' || kind === 'time'" class="cell-text cell-date">{{ text }}</span>
  <span v-else class="cell-text" @mouseenter="titleIfClipped">{{ text }}</span>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'
  import { chipsFor, formatDateValue, formatNumberValue, isEmptyValue, richTextToPlain } from '@u/tableModel'
  import { ICONS, ratingOptions, ratingText } from '@u/rating'
  import { durationOptions, formatDuration } from '@u/duration'
  import { formatMoney } from '@u/money'
  import { formatPhone, splitE164 } from '@u/phone'
  import { localeTag } from '@u/locale'

  /**
   * One table cell, rendered by column kind: check or dash for booleans, chips with "+n" for selects, thumbnails,
   * consistent dates, tabular numbers, safe links, truncated text (title tooltip only when it is really clipped).
   */
  export default {
    props: {
      column: { type: Object, required: true },
      record: { type: Object, required: true },
      // { optionLabel(column, value) -> string, imageUrl(record, column) -> string|false, fileName(record, column) -> string }
      helpers: { type: Object, default: () => ({}) }
    },
    computed: {
      /** @returns {string} */
      kind () {
        return this.column.kind
      },
      /** @returns {*} */
      value () {
        return _.get(this.record, this.column.model)
      },
      /** @returns {string|false} */
      imageSrc () {
        return _.isFunction(this.helpers.imageUrl) ? this.helpers.imageUrl(this.record, this.column) : false
      },
      /** @returns {string} */
      attachmentName () {
        return _.isFunction(this.helpers.fileName) ? this.helpers.fileName(this.record, this.column) : ''
      },
      /** @returns {boolean} never for an image */
      empty () {
        if (this.kind === 'image') {
          return false
        }
        if (this.kind === 'file') {
          return !this.attachmentName
        }
        return isEmptyValue(this.value)
      },
      /** @returns {string} "not translated" for a locale column */
      emptyLabel () {
        return TranslateService.get(this.column.locale ? 'TL_NOT_TRANSLATED' : 'TL_EMPTY_VALUE')
      },
      /** @returns {Object} the first two labels and the count of the rest (chipsFor) */
      chips () {
        const label = (v) => (_.isFunction(this.helpers.optionLabel) ? this.helpers.optionLabel(this.column, v) : v)
        return chipsFor(_.map(_.castArray(this.value), label), 2)
      },
      /** @returns {string} the icon a rating is made of, filled */
      ratingIcon () {
        return ICONS[ratingOptions(this.column.field).icon].full
      },
      /** @returns {string} the value as text, by kind */
      text () {
        const value = this.value
        switch (this.kind) {
          case 'number': return formatNumberValue(value)
          case 'duration': return formatDuration(value, durationOptions(this.column.field).units, localeTag(TranslateService.locale))
          case 'phone': return formatPhone(value)
          case 'money': return formatMoney(value, localeTag(TranslateService.locale))
          case 'rating': return ratingText(value, ratingOptions(this.column.field).max)
          case 'date':
          case 'datetime':
          case 'time': return formatDateValue(value, this.kind)
          case 'richtext': return richTextToPlain(value)
          case 'select': return _.isFunction(this.helpers.optionLabel) ? this.helpers.optionLabel(this.column, value) : _.toString(value)
          case 'file': return this.attachmentName
          case 'json': return _.isArray(value) ? `${value.length} items` : `{ ${_.size(value)} }`
          case 'paragraph': return `${_.size(value)}`
          default: return _.isObject(value) ? JSON.stringify(value) : _.toString(value)
        }
      },
      /** @returns {string|false} a telephone number is a link that calls it (only an international number is) */
      phoneHref () {
        return splitE164(this.value) ? `tel:${this.value}` : false
      },
      // Only http(s) and mailto links are rendered as links; anything else stays plain text (no javascript: urls)
      href () {
        const text = _.trim(_.toString(this.value))
        if (this.column.input === 'email') {
          return /^[^\s@<>]+@[^\s@<>]+$/.test(text) ? `mailto:${text}` : false
        }
        return /^https?:\/\//i.test(text) ? text : false
      }
    },
    methods: {
      // A native tooltip with the full text, only when the text is actually clipped by the column width
      titleIfClipped (event) {
        const el = event.currentTarget
        el.title = el.scrollWidth > el.clientWidth ? el.textContent : ''
      }
    }
  }
</script>
