<template>
  <v-dialog :model-value="modelValue" class="geo-dialog" max-width="860" :aria-labelledby="titleId" @update:model-value="onUpdate" @after-enter="startMap" @after-leave="stopMap">
    <v-card class="geo-card">
      <h2 :id="titleId" class="geo-title">{{ $filters.translate('TL_GEOPOINT_MAP_TITLE') }}</h2>
      <div class="geo-body">
        <div class="geo-tools">
          <v-text-field
            v-if="config.search" v-model="query" class="geo-search" :label="$filters.translate('TL_GEOPOINT_SEARCH')" density="compact" variant="outlined" hide-details clearable
            :disabled="status !== 'ready'" append-inner-icon="$magnify" autocomplete="off" @keydown.enter.prevent="onSearch" @click:append-inner="onSearch"
          />
        </div>
        <p v-if="searchMessage" class="geo-message" role="status">{{ searchMessage }}</p>
        <div class="geo-map">
          <div ref="stage" class="geo-stage" role="region" :aria-label="$filters.translate('TL_GEOPOINT_STAGE')" />
          <p v-if="status === 'loading'" class="geo-state" role="status">{{ $filters.translate('TL_GEOPOINT_LOADING') }}</p>
          <p v-else-if="status === 'error'" class="geo-state is-error" role="alert">{{ $filters.translate('TL_GEOPOINT_LOAD_ERROR') }}</p>
        </div>
        <p class="geo-hint">{{ $filters.translate('TL_GEOPOINT_HINT') }}</p>
      </div>
      <div class="geo-foot">
        <span class="geo-point" aria-live="polite">{{ pointText || $filters.translate('TL_GEOPOINT_NO_POINT') }}</span>
        <v-spacer />
        <v-btn class="geo-cancel" variant="text" @click="close">{{ $filters.translate('TL_CANCEL') }}</v-btn>
        <v-btn class="geo-use" color="primary" variant="flat" :disabled="!picked" @click="confirm">{{ $filters.translate('TL_GEOPOINT_USE') }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'
  import { formatGeopoint, normaliseGeopoint, roundCoordinate } from '@u/geopoint'
  import { createMapAdapter, initialView } from '@u/maps'

  let counter = 0

  /**
   * The map where a point of a geopoint field is picked: a click, or the pin dragged, or the address searched. It draws the map only once it is open, keeps the point
   * in WGS-84, and gives it to the field when "Use this point" is pressed.
   */
  export default {
    props: {
      modelValue: { type: Boolean, default: false },
      // the point the field holds, shown on the map when it is opened
      point: { type: Object, default: undefined },
      // what the server says of the map (see /admin/maps): the tiles, and the search or nothing
      config: { type: Object, default: () => ({}) },
      // what the field says (see geopointOptions): precision, zoom, center
      options: { type: Object, default: () => ({}) }
    },
    emits: ['update:modelValue', 'pick'],
    data () {
      return {
        titleId: `geo-title-${++counter}`,
        // how the map is: loading, ready, or error
        status: 'loading',
        // the point on the map, which is not the field's until it is used
        picked: undefined,
        query: '',
        searchMessage: ''
      }
    },
    computed: {
      /** @returns {string} the point written for the foot of the dialog */
      pointText () {
        return this.picked ? formatGeopoint(this.picked, this.precision) : ''
      },
      /** @returns {number} */
      precision () {
        return _.isInteger(this.options.precision) ? this.options.precision : 6
      }
    },
    watch: {
      // opened: the map begins with the point of the field
      modelValue (open) {
        if (open) {
          this.picked = normaliseGeopoint(this.point)
          this.status = 'loading'
          this.query = ''
          this.searchMessage = ''
        }
      }
    },
    beforeUnmount () {
      this.stopMap()
    },
    methods: {
      /** @param {boolean} open the dialog asks to close (Escape, a click outside) */
      onUpdate (open) {
        this.$emit('update:modelValue', open)
      },
      close () {
        this.$emit('update:modelValue', false)
      },
      /** The point on the map goes to the field. */
      confirm () {
        if (this.picked) {
          this.$emit('pick', this.picked)
          this.close()
        }
      },
      /** Draws the map in the dialog. */
      async startMap () {
        this.stopMap()
        const stage = this.$refs.stage
        if (!stage) {
          return
        }
        const token = ++this.token
        this.status = 'loading'
        try {
          const adapter = await createMapAdapter({
            config: this.config,
            container: stage,
            view: initialView(this.picked, this.options),
            lang: _.startsWith(TranslateService.locale, 'zh') ? 'zh' : 'en',
            onPick: this.onMapPick
          })
          if (token !== this.token) {
            // closed while the map was loading
            adapter.destroy()
            return
          }
          this.adapter = adapter
          adapter.setPoint(this.picked, { pan: false })
          this.status = 'ready'
        } catch (error) {
          if (token === this.token) {
            console.error('The map could not be drawn:', error)
            this.status = 'error'
          }
        }
      },
      /** Takes the map down. */
      stopMap () {
        this.token = (this.token || 0) + 1
        if (this.adapter) {
          try {
            this.adapter.destroy()
          } catch (error) {
            console.error('The map could not be taken down:', error)
          }
          this.adapter = null
        }
      },
      /** @param {{lat: number, lng: number}} point the person clicked the map or dropped the pin there */
      onMapPick (point) {
        this.picked = { lat: roundCoordinate(point.lat, this.precision), lng: roundCoordinate(point.lng, this.precision) }
        this.searchMessage = ''
        if (this.adapter) {
          this.adapter.setPoint(this.picked, { pan: false })
        }
      },
      /** Looks for the address that was typed and puts the pin there. */
      async onSearch () {
        const text = _.trim(this.query)
        if (!text || !this.adapter) {
          return
        }
        this.searchMessage = ''
        try {
          const found = await this.adapter.search(text)
          if (found) {
            this.onMapPick(found)
            this.adapter.setPoint(this.picked, { pan: true })
          } else {
            this.searchMessage = TranslateService.get('TL_GEOPOINT_NO_RESULT')
          }
        } catch (error) {
          console.error('The search failed:', error)
          this.searchMessage = TranslateService.get('TL_GEOPOINT_SEARCH_ERROR')
        }
      }
    }
  }
</script>

<style lang="scss">
.geo-dialog {
  .geo-card {
    background: var(--cms-surface);
    color: var(--cms-text);
    border-radius: var(--cms-radius-lg);
  }
  .geo-title {
    margin: 0;
    padding: var(--cms-space-4) var(--cms-space-6);
    font-size: var(--cms-fs-lg);
    font-weight: var(--cms-fw-semibold);
    border-bottom: 1px solid var(--cms-border);
  }
  .geo-body {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-3);
    padding: var(--cms-space-4) var(--cms-space-6);
  }
  .geo-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-3);
  }
  .geo-search {
    flex: 1 1 260px;
  }
  .geo-map {
    position: relative;
  }
  .geo-stage {
    height: min(52vh, 440px);
    min-height: 260px;
    border-radius: var(--cms-radius-md);
    border: 1px solid var(--cms-border);
    background: var(--cms-surface-2, var(--cms-border));
    overflow: hidden;
  }
  // what the map says when it has nothing to draw yet or cannot be drawn
  .geo-state {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: var(--cms-space-4);
    text-align: center;
    color: var(--cms-text-muted);
    pointer-events: none;
    &.is-error {
      color: var(--cms-error);
      background: var(--cms-surface);
      border-radius: var(--cms-radius-md);
    }
  }
  .geo-message {
    margin: 0;
    color: var(--cms-text-muted);
    font-size: var(--cms-fs-sm);
  }
  .geo-hint {
    margin: 0;
    color: var(--cms-text-muted);
    font-size: var(--cms-fs-sm);
  }
  .geo-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-3);
    padding: var(--cms-space-3) var(--cms-space-6) var(--cms-space-4);
    border-top: 1px solid var(--cms-border);
  }
  // the pin on the map: the colour of an error on the colour of the surface, so that it shows on any tile
  .geo-pin {
    path {
      fill: var(--cms-error);
      stroke: var(--cms-surface);
      stroke-width: 2;
    }
    circle {
      fill: var(--cms-surface);
    }
  }
  .geo-point {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
}
</style>
