<template>
  <div class="geopoint-field" :class="{ 'is-readonly': isReadonly, 'is-disabled': isDisabled }" role="group" :aria-labelledby="`${inputId}-lat-label`">
    <field-label :schema="schema" :disabled="disabled" :input-id="`${inputId}-lat`" />
    <div class="geopoint-row">
      <div class="geopoint-box">
        <label :for="`${inputId}-lat`" class="cms-visually-hidden">{{ $filters.translate('TL_LATITUDE') }}</label>
        <v-text-field
          :id="`${inputId}-lat`" ref="input" :model-value="latText" :name="`${schema.model}-lat`" type="text" autocomplete="off" hide-details :placeholder="$filters.translate('TL_LATITUDE')"
          :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :rules="[latRule]" validate-on="blur"
          :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
          class="geopoint-lat" @update:model-value="onInput('lat', $event)" @blur="onBlur" @update:focused="onFieldFocus"
        />
      </div>
      <div class="geopoint-box">
        <label :for="`${inputId}-lng`" class="cms-visually-hidden">{{ $filters.translate('TL_LONGITUDE') }}</label>
        <v-text-field
          :id="`${inputId}-lng`" :model-value="lngText" :name="`${schema.model}-lng`" type="text" autocomplete="off" hide-details :placeholder="$filters.translate('TL_LONGITUDE')"
          :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :rules="[lngRule]" validate-on="blur"
          :disabled="isDisabled" :readonly="isReadonly" :aria-readonly="isReadonly ? 'true' : undefined" :aria-required="schema.required ? 'true' : undefined"
          class="geopoint-lng" @update:model-value="onInput('lng', $event)" @blur="onBlur" @update:focused="onFieldFocus"
        />
      </div>
      <div v-if="!isReadonly && !isDisabled" class="geopoint-actions">
        <v-btn v-if="canPick" class="geopoint-pick" variant="tonal" prepend-icon="$mapMarker" @click="open = true">{{ $filters.translate('TL_GEOPOINT_PICK') }}</v-btn>
        <v-btn
          v-if="latText !== '' || lngText !== ''" class="geopoint-clear" icon="$close" variant="text" size="small" :title="$filters.translate('TL_GEOPOINT_CLEAR')"
          :aria-label="$filters.translate('TL_GEOPOINT_CLEAR')" @click="clear"
        />
      </div>
    </div>
    <div v-if="message" class="geopoint-error" role="alert">{{ message }}</div>
    <div v-else-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
    <geo-picker-dialog v-if="canPick" v-model="open" :point="current" :config="maps" :options="options" @pick="onPick" />
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import MapService from '@s/MapService'
  import GeoPickerDialog from '@c/fields/GeoPickerDialog.vue'
  import { formatCoordinate, geopointOptions, normaliseGeopoint, parseCoordinate, parsePair, roundCoordinate, validateGeopointText } from '@u/geopoint'

  /**
   * A place on Earth. The value is `{ lat, lng }` in degrees (WGS-84), or nothing when the boxes are empty (a latitude without a longitude is no value). The boxes take a number, a
   * side (`48.8566 N`), degrees, minutes and seconds, or a pair pasted in either of them; unless the `maps` option turns the map off, a button opens a map to pick on.
   */
  export default {
    components: { GeoPickerDialog },
    mixins: [AbstractField],
    emits: ['input'],
    data () {
      return {
        // what is typed in the two boxes (text, so that an empty box stays empty and a half-typed number stays as typed)
        latText: '',
        lngText: '',
        // what is wrong with the boxes, shown under them
        message: '',
        // what the server says of the map: whether there is one, the tiles and the search
        maps: { enabled: false },
        open: false
      }
    },
    computed: {
      /** @returns {{precision: number, zoom: number, center: Object|undefined}} what the field says */
      options () {
        return geopointOptions(this.schema)
      },
      /** @returns {{lat: number, lng: number}|undefined} the value of the record when it is a point */
      current () {
        return normaliseGeopoint(_.get(this.model, this.schema.model))
      },
      /** @returns {boolean} there is a map to pick on, and the field may be changed */
      canPick () {
        return !this.isReadonly && !this.isDisabled && !!this.maps.enabled
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
        const typed = this.typedValue()
        if (!(_.isEqual(typed, value) || (_.isUndefined(typed) && _.isUndefined(value)))) {
          this.showValue()
        }
      }
    },
    created () {
      this.showValue()
      if (!this.isReadonly && !this.isDisabled) {
        MapService.load().then((maps) => {
          this.maps = maps || this.maps
        })
      }
    },
    methods: {
      /** Fills the boxes from the value. */
      showValue () {
        const value = this.current
        this.latText = value ? formatCoordinate(value.lat, this.options.precision) : ''
        this.lngText = value ? formatCoordinate(value.lng, this.options.precision) : ''
      },
      /** @returns {{lat: number, lng: number}|undefined} what the boxes make: nothing when one is empty or is not a coordinate */
      typedValue () {
        const lat = parseCoordinate(this.latText, 'lat')
        const lng = parseCoordinate(this.lngText, 'lng')
        return _.isFinite(lat) && _.isFinite(lng) ? { lat: roundCoordinate(lat, this.options.precision), lng: roundCoordinate(lng, this.options.precision) } : undefined
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
        return validateGeopointText(this.schema, this.latText, this.lngText)
      },
      /**
       * @param {'lat'|'lng'} axis the box
       * @param {string|null} text what was typed in it; a pair pasted in one box (`48.8566, 2.3522`) fills both
       */
      onInput (axis, text) {
        if (this.isLocked()) {
          return
        }
        const typed = _.isNil(text) ? '' : String(text)
        const pair = _.isNaN(parseCoordinate(typed, axis)) ? parsePair(typed) : undefined
        if (pair) {
          this.latText = formatCoordinate(pair.lat, this.options.precision)
          this.lngText = formatCoordinate(pair.lng, this.options.precision)
        } else if (axis === 'lat') {
          this.latText = typed
        } else {
          this.lngText = typed
        }
        this.emitValue()
      },
      /** @param {{lat: number, lng: number}} point picked on the map */
      onPick (point) {
        if (this.isLocked()) {
          return
        }
        this.latText = formatCoordinate(point.lat, this.options.precision)
        this.lngText = formatCoordinate(point.lng, this.options.precision)
        this.message = ''
        this.emitValue()
      },
      /** The point is taken away. */
      clear () {
        if (this.isLocked()) {
          return
        }
        this.latText = ''
        this.lngText = ''
        this.message = ''
        this.emitValue()
      },
      /** Leaving a box: a coordinate is written as it is kept (the decimals asked, the side and the minutes turned into degrees), and the boxes are checked. */
      onBlur () {
        const lat = parseCoordinate(this.latText, 'lat')
        const lng = parseCoordinate(this.lngText, 'lng')
        if (_.isFinite(lat)) {
          this.latText = formatCoordinate(lat, this.options.precision)
        }
        if (_.isFinite(lng)) {
          this.lngText = formatCoordinate(lng, this.options.precision)
        }
        this.message = this.check()
      },
      /**
       * The rule of a box (Vuetify asks for it when the record is shown, when the box is left and when the record is saved). What is wrong says so under the boxes, and reddens the
       * box that is wrong or missing, not the other; a point that is missing and required does not say so (the editor marks it after a failed save, and a form that has not been
       * touched is not red).
       * @param {'lat'|'lng'} axis the box
       * @returns {true|string}
       */
      rule (axis) {
        const message = this.check()
        this.message = _.trim(this.latText) === '' && _.trim(this.lngText) === '' ? '' : message
        const value = parseCoordinate(axis === 'lat' ? this.latText : this.lngText, axis)
        return message && (_.isNaN(value) || _.isUndefined(value)) ? message : true
      },
      /** @returns {true|string} the rule of the latitude box */
      latRule () {
        return this.rule('lat')
      },
      /** @returns {true|string} the rule of the longitude box */
      lngRule () {
        return this.rule('lng')
      }
    }
  }
</script>

<style lang="scss">
.geopoint-field {
  .geopoint-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-4);
  }
  .geopoint-box {
    flex: 1 1 150px;
    max-width: 220px;
    input {
      font-variant-numeric: tabular-nums;
    }
  }
  .geopoint-actions {
    display: flex;
    align-items: center;
    gap: var(--cms-space-2);
  }
  .geopoint-error {
    margin-top: var(--cms-space-1);
    color: var(--cms-error);
    font-size: var(--cms-fs-sm);
  }
}
</style>
