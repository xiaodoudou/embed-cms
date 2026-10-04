<template>
  <v-dialog
    :model-value="modelValue" class="map-dialog" max-width="1180" scrollable :aria-labelledby="titleId"
    @update:model-value="onUpdate"
  >
    <v-card class="map-card">
      <h2 :id="titleId" class="map-title">{{ title }}</h2>
      <div class="map-body">
        <div ref="stage" class="map-stage">
          <div v-if="modelValue" ref="canvas" class="map-canvas" :class="{ 'is-fitted': fit > 0 }" :style="canvasStyle">
            <img class="map-image" :src="src" alt="" draggable="false" @load="onLoad" @error="onError">
            <svg
              v-if="ready" ref="overlay" class="map-overlay" :class="`is-${tool}`" :viewBox="`0 0 ${size.width} ${size.height}`" preserveAspectRatio="none"
              tabindex="0" role="application" :aria-label="$filters.translate('TL_MAP_STAGE')"
              @pointerdown.prevent="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @dblclick="onDoubleClick" @keydown="onKey"
            >
              <g v-for="item in drawn" :key="item.area.id" class="map-area" :class="{ 'is-selected': item.index === selected }">
                <rect v-if="item.area.shape === 'rect'" :x="item.area.coords[0] * size.width" :y="item.area.coords[1] * size.height" :width="(item.area.coords[2] - item.area.coords[0]) * size.width" :height="(item.area.coords[3] - item.area.coords[1]) * size.height" />
                <circle v-else-if="item.area.shape === 'circle'" :cx="item.area.coords[0] * size.width" :cy="item.area.coords[1] * size.height" :r="item.area.coords[2] * size.width" />
                <polygon v-else :points="svgPoints(item.area, size.width, size.height)" />
                <text class="map-number" :x="item.centre.x" :y="item.centre.y" :font-size="14 * unit" text-anchor="middle" dominant-baseline="central">{{ item.index + 1 }}</text>
              </g>
              <!-- what is being drawn -->
              <g v-if="draft" class="map-area is-draft">
                <rect v-if="draft.shape === 'rect'" :x="draft.coords[0] * size.width" :y="draft.coords[1] * size.height" :width="(draft.coords[2] - draft.coords[0]) * size.width" :height="(draft.coords[3] - draft.coords[1]) * size.height" />
                <circle v-else :cx="draft.coords[0] * size.width" :cy="draft.coords[1] * size.height" :r="draft.coords[2] * size.width" />
              </g>
              <g v-if="points.length" class="map-area is-draft">
                <polyline :points="pendingPoints" />
                <rect v-for="(point, i) in points" :key="i" class="map-handle" :class="{ 'is-first': i === 0 }" :x="point.x * size.width - handleSize / 2" :y="point.y * size.height - handleSize / 2" :width="handleSize" :height="handleSize" />
              </g>
              <g v-if="current && tool === 'select'" class="map-handles">
                <rect
                  v-for="handle in handles" :key="handle.key" class="map-handle" :data-handle="handle.key"
                  :x="handle.x * size.width - handleSize / 2" :y="handle.y * size.height - handleSize / 2" :width="handleSize" :height="handleSize"
                />
              </g>
            </svg>
          </div>
          <p v-if="loadError" class="map-error" role="alert">{{ $filters.translate('TL_LOADING_ERROR') }}</p>
        </div>

        <div class="map-tools">
          <section class="map-section" role="group" :aria-labelledby="`${titleId}-tools`">
            <h3 :id="`${titleId}-tools`" class="map-heading">{{ $filters.translate('TL_MAP_TOOLS') }}</h3>
            <div class="map-choices">
              <v-btn
                v-for="item in toolItems" :key="item.key" :class="`map-tool map-tool-${item.key}`" size="small" rounded :variant="tool === item.key ? 'flat' : 'outlined'" :color="tool === item.key ? 'primary' : undefined"
                :aria-pressed="tool === item.key ? 'true' : 'false'" :disabled="!ready" @click="setTool(item.key)"
              >
                <v-icon :icon="item.icon" start />{{ $filters.translate(item.label) }}
              </v-btn>
            </div>
            <p class="map-hint" aria-live="polite">{{ $filters.translate(hint) }}</p>
            <div v-if="points.length" class="map-choices">
              <v-btn class="map-finish" size="small" rounded variant="flat" color="primary" :disabled="points.length < 3" @click="finishPolygon">{{ $filters.translate('TL_MAP_FINISH_POLYGON') }}</v-btn>
              <v-btn class="map-cancel-drawing" size="small" rounded variant="outlined" @click="cancelDrawing">{{ $filters.translate('TL_MAP_CANCEL_DRAWING') }}</v-btn>
            </div>
          </section>

          <section class="map-section" role="group" :aria-labelledby="`${titleId}-areas`">
            <div class="map-heading-row">
              <h3 :id="`${titleId}-areas`" class="map-heading">{{ $filters.translate('TL_MAP_AREAS') }} ({{ areas.length }})</h3>
              <v-menu>
                <template #activator="{ props }">
                  <v-btn v-bind="props" class="map-add" size="small" rounded variant="outlined" :disabled="!ready"><v-icon icon="$plus" start />{{ $filters.translate('TL_MAP_ADD') }}</v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item v-for="item in toolItems.slice(1)" :key="item.key" :class="`map-add-${item.key}`" :prepend-icon="item.icon" :title="$filters.translate(item.label)" @click="addDefault(item.key)" />
                </v-list>
              </v-menu>
            </div>
            <p v-if="!areas.length" class="map-empty">{{ $filters.translate('TL_MAP_NO_AREAS') }}</p>
            <ul v-else class="map-list">
              <li v-for="(area, index) in areas" :key="area.id" class="map-row" :class="{ 'is-selected': index === selected, 'has-problem': isBad(area) }">
                <button type="button" class="map-pick" :aria-current="index === selected ? 'true' : undefined" @click="select(index)">
                  <v-icon :icon="shapeIcon(area.shape)" size="small" />
                  <span class="map-number-label">{{ index + 1 }}</span>
                  <span class="map-name">{{ rowName(area) }}</span>
                  <span v-if="rowLink(area)" class="map-link-text">{{ rowLink(area) }}</span>
                </button>
                <v-btn class="map-up" icon variant="text" size="x-small" :disabled="index === 0" :aria-label="$filters.translate('TL_MAP_MOVE_UP')" :title="$filters.translate('TL_MAP_MOVE_UP')" @click="move(index, -1)"><v-icon icon="$arrowUp" /></v-btn>
                <v-btn class="map-down" icon variant="text" size="x-small" :disabled="index === areas.length - 1" :aria-label="$filters.translate('TL_MAP_MOVE_DOWN')" :title="$filters.translate('TL_MAP_MOVE_DOWN')" @click="move(index, 1)"><v-icon icon="$arrowDown" /></v-btn>
                <v-btn class="map-delete" icon variant="text" size="x-small" :aria-label="$filters.translate('TL_MAP_DELETE_AREA')" :title="$filters.translate('TL_MAP_DELETE_AREA')" @click="remove(index)"><v-icon icon="$trashCanOutline" /></v-btn>
              </li>
            </ul>
          </section>

          <section v-if="current" class="map-section map-properties" role="group" :aria-labelledby="`${titleId}-area`">
            <h3 :id="`${titleId}-area`" class="map-heading">{{ $filters.translate('TL_MAP_AREA') }} {{ selected + 1 }}</h3>
            <div v-if="kinds.length > 1" class="map-choices map-link-kind" role="group" :aria-label="$filters.translate('TL_MAP_LINK')">
              <v-btn
                v-for="kind in kinds" :key="kind" :class="`map-kind-${kind}`" size="small" rounded :variant="linkKind === kind ? 'flat' : 'outlined'" :color="linkKind === kind ? 'primary' : undefined"
                :aria-pressed="linkKind === kind ? 'true' : 'false'" @click="setLinkKind(kind)"
              >
                {{ kindLabel(kind) }}
              </v-btn>
            </div>

            <!-- an address: it has a title, and says where it opens -->
            <template v-if="linkKind === 'url'">
              <div class="map-field map-title-field">
                <label :id="`${titleId}-title-label`" :for="`${titleId}-title`" class="map-label">{{ $filters.translate('TL_MAP_TITLE') }}</label>
                <v-text-field :id="`${titleId}-title`" v-model="current.title" name="map-title" density="compact" variant="outlined" hide-details maxlength="200" />
              </div>
              <div class="map-field map-url-field">
                <label :id="`${titleId}-href-label`" :for="`${titleId}-href`" class="map-label">{{ $filters.translate('TL_MAP_URL') }}</label>
                <v-text-field :id="`${titleId}-href`" v-model="current.href" name="map-href" density="compact" variant="outlined" placeholder="https://, /path, mailto:, tel:" :error="!isSafeHref(current.href)" hide-details />
                <p v-if="!isSafeHref(current.href)" class="map-error" role="alert">{{ $filters.translate('TL_MAP_URL_INVALID') }}</p>
              </div>
            </template>

            <!-- a record, of one resource or of several: no title (the record is what it is called), and where it opens only when the field says so -->
            <template v-else-if="linkKind === 'record'">
              <div v-if="references.length > 1" class="map-field map-resource-field">
                <label :id="`${titleId}-resource-label`" :for="`${titleId}-resource`" class="map-label">{{ $filters.translate('TL_MAP_RESOURCE') }}</label>
                <v-select :id="`${titleId}-resource`" :model-value="current.ref.resource" name="map-resource" :items="resourceItems" density="compact" variant="outlined" hide-details @update:model-value="setReferenceResource" />
              </div>
              <div class="map-field map-record-field">
                <label :id="`${titleId}-record-label`" :for="`${titleId}-record`" class="map-label">{{ recordFieldLabel }}</label>
                <v-autocomplete
                  :id="`${titleId}-record`" v-model="current.ref.id" name="map-record" :items="recordItems" :loading="loadingRecords" density="compact" variant="outlined" hide-details
                  :no-data-text="$filters.translate('TL_MAP_NO_RECORDS', { name: recordFieldLabel })" clearable
                />
              </div>
            </template>

            <!-- a value: whatever the person types, for the site to make of -->
            <div v-else class="map-field map-value-field">
              <label :id="`${titleId}-value-label`" :for="`${titleId}-value`" class="map-label">{{ kindLabel('value') }}</label>
              <v-text-field :id="`${titleId}-value`" v-model="current.value" name="map-value" density="compact" variant="outlined" hide-details maxlength="500" />
            </div>

            <div v-if="asksWhereItOpens" class="map-field map-target-field">
              <label :id="`${titleId}-target-label`" :for="`${titleId}-target`" class="map-label">{{ $filters.translate('TL_MAP_TARGET') }}</label>
              <v-select :id="`${titleId}-target`" v-model="current.target" name="map-target" :items="targetItems" density="compact" variant="outlined" hide-details />
            </div>

            <h4 class="map-subheading">{{ $filters.translate('TL_MAP_POSITION') }}</h4>
            <div v-if="positionFields.length" class="map-grid">
              <div v-for="field in positionFields" :key="field.key" class="map-field" :class="`map-position-${field.key}`">
                <label :id="`${titleId}-${field.key}-label`" :for="`${titleId}-${field.key}`" class="map-label">{{ $filters.translate(field.label) }}</label>
                <v-text-field
                  :id="`${titleId}-${field.key}`" :model-value="field.value" :name="`map-${field.key}`" type="number" min="0" max="100" step="0.1" density="compact" variant="outlined" hide-details
                  suffix="%" @change="setPosition(field.key, $event)"
                />
              </div>
            </div>
            <p v-else class="map-hint">{{ $filters.translate('TL_MAP_POINTS', { n: current.coords.length / 2 }) }}</p>
          </section>
        </div>
      </div>
      <div class="map-foot">
        <v-btn v-if="areas.length" class="map-clear" variant="text" rounded @click="clear">{{ $filters.translate('TL_MAP_CLEAR') }}</v-btn>
        <p v-if="problems" class="map-error" role="alert">{{ $filters.translate('TL_MAP_PROBLEMS') }}</p>
        <v-spacer />
        <v-btn class="map-cancel" variant="outlined" rounded @click="close">{{ $filters.translate('TL_CANCEL') }}</v-btn>
        <v-btn class="apply map-apply" variant="flat" color="primary" rounded :disabled="!ready || problems > 0" @click="apply">{{ $filters.translate('TL_APPLY_MAP') }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script>
  import _ from 'lodash'
  import ResourceService from '@s/ResourceService'
  import {
    areaAt, boundsOf, buildMap, circleFromPoints, clamp01, dragHandle, handlesOf, isBigEnough, isSafeHref, kindOf, linkKinds, linkText, moveArea, newId, readAreas,
    recordLabel, rectFromPoints, referencesOf, removePoint, svgPoints, MIN_SIZE
  } from '@u/imageMap'

  let dialogCounter = 0

  const TOOLS = [
    { key: 'select', icon: '$cursorDefaultOutline', label: 'TL_MAP_SELECT' },
    { key: 'rect', icon: '$squareOutline', label: 'TL_MAP_RECTANGLE' },
    { key: 'circle', icon: '$circleOutline', label: 'TL_MAP_CIRCLE' },
    { key: 'poly', icon: '$vectorPolygon', label: 'TL_MAP_POLYGON' }
  ]
  const HINTS = { select: 'TL_MAP_HINT_SELECT', rect: 'TL_MAP_HINT_RECT', circle: 'TL_MAP_HINT_CIRCLE', poly: 'TL_MAP_HINT_POLY' }
  // a click this close (in screen pixels) to the first point of a polygon closes it
  const CLOSE_DISTANCE = 12
  // a picture is shown larger than it is, to fill the room the stage has, up to this many times (a small picture is easier to draw on)
  const MAX_ZOOM = 4
  // an arrow key moves the area a fraction of the picture; with Shift, ten times that
  const NUDGE = 0.005

  /**
   * The image map tool, in a modal: the areas of a picture (rectangles, circles, polygons) drawn on it, each with a title, a link (an address, or
   * a record of another resource) and a target. Nothing is written here: it gives back the map the attachment keeps (see utils/imageMap.js).
   */
  export default {
    props: {
      modelValue: { type: Boolean, default: false },
      title: { type: String, default: '' },
      // the picture: its address, or its data url before it is uploaded
      src: { type: String, default: '' },
      // the field: `links` says what an area can link to (an address, a record, a value), `references` the resources a record is from, `labels` and `openIn` change the words and the options
      schema: { type: Object, default: () => ({}) },
      // the map kept with the picture, when there is one
      imageMap: { type: Object, default: undefined }
    },
    emits: ['update:modelValue', 'apply'],
    data () {
      dialogCounter++
      return {
        titleId: `cms-map-title-${dialogCounter}`,
        ready: false,
        loadError: false,
        // the picture in pixels, and how wide it is shown (the size of a handle and of a number does not follow the picture)
        size: { width: 1, height: 1 },
        shownWidth: 0,
        // how many times the picture is shown at its size to fill the stage (0: not measured yet, it takes the room its own size and the stylesheet allow)
        fit: 0,
        areas: [],
        selected: -1,
        tool: 'select',
        // a rectangle or a circle being drawn, the points of a polygon being drawn, and where the pointer is
        draft: null,
        drawStart: null,
        points: [],
        pointer: null,
        drag: null,
        // the records a link can point to, by resource
        records: {},
        // the resources whose records were asked for since the tool opened
        refreshed: {},
        loadingRecords: false,
        toolItems: TOOLS
      }
    },
    computed: {
      /** @returns {Array<{resource: string, label: string, url: string}>} the resources a link can point to */
      references () {
        return referencesOf(this.schema)
      },
      /** @returns {Array<'url'|'record'|'value'>} what an area can link to */
      kinds () {
        return linkKinds(this.schema)
      },
      /** @returns {boolean} whether the field asks where a record opens (an address always does) */
      openIn () {
        return !!_.get(this.schema, 'openIn', _.get(this.schema, 'options.openIn', false))
      },
      /** @returns {boolean} whether the selected area says where it opens: an address always, a record when the field asks, a value never */
      asksWhereItOpens () {
        return this.linkKind === 'url' || (this.linkKind === 'record' && this.openIn)
      },
      /** @returns {Object} the words the field changes: `labels: { url, record, value }` */
      labels () {
        return _.get(this.schema, 'labels', _.get(this.schema, 'options.labels', {})) || {}
      },
      /** @returns {Array<{value: string, title: string}>} the resources a record can be from, by the title the field gives them */
      resourceItems () {
        return _.map(this.references, reference => ({ value: reference.resource, title: this.referenceTitle(reference.resource) || reference.resource }))
      },
      /** @returns {string} what the record to pick is called: the title of its resource, else the word the field gives, else Record */
      recordFieldLabel () {
        return this.referenceTitle(_.get(this.current, 'ref.resource')) || this.translated(this.labels.record) || this.$filters.translate('TL_MAP_RECORD')
      },
      /** @returns {Object|null} the area that is selected */
      current () {
        return this.areas[this.selected] || null
      },
      /** @returns {Object} the box of the picture, the size that fills the stage */
      canvasStyle () {
        return this.fit > 0 ? { width: `${Math.round(this.size.width * this.fit)}px`, height: `${Math.round(this.size.height * this.fit)}px` } : {}
      },
      /** @returns {number} how many units of the picture a pixel of the screen is */
      unit () {
        return this.shownWidth ? this.size.width / this.shownWidth : 1
      },
      /** @returns {number} the side of a handle, in units of the picture */
      handleSize () {
        return 10 * this.unit
      },
      /** @returns {Array<{area: Object, index: number, centre: {x: number, y: number}}>} the areas, the last first, so that the first is drawn over the others */
      drawn () {
        return _.reverse(_.map(this.areas, (area, index) => {
          const box = boundsOf(area, this.size)
          return { area, index, centre: { x: (box.left + box.right) / 2 * this.size.width, y: (box.top + box.bottom) / 2 * this.size.height } }
        }))
      },
      /** @returns {Array<{key: string, x: number, y: number}>} the handles of the selected area */
      handles () {
        return this.current ? handlesOf(this.current) : []
      },
      /** @returns {string} the polygon being drawn, with the line to the pointer */
      pendingPoints () {
        const all = this.pointer ? [...this.points, this.pointer] : this.points
        return _.map(all, point => `${point.x * this.size.width},${point.y * this.size.height}`).join(' ')
      },
      /** @returns {string} the translation key of what to do with the tool that is chosen */
      hint () {
        return HINTS[this.tool]
      },
      /** @returns {'url'|'record'|'value'} how the selected area links */
      linkKind () {
        return this.current ? this.current._kind : 'url'
      },
      /** @returns {Array<{value: string, title: string}>} */
      targetItems () {
        return [{ value: '_self', title: this.$filters.translate('TL_MAP_SAME_TAB') }, { value: '_blank', title: this.$filters.translate('TL_MAP_NEW_TAB') }]
      },
      /** @returns {Array<{value: string, title: string}>} the records of the resource the selected area points to, by name */
      recordItems () {
        const ref = _.get(this.current, 'ref')
        if (!ref) {
          return []
        }
        const reference = _.find(this.references, { resource: ref.resource })
        const resource = ResourceService.getSchema(ref.resource)
        const locale = _.get(this.schema, 'userLocale') || _.get(this.schema, 'locale') || 'enUS'
        const items = _.sortBy(_.map(this.records[ref.resource], record => ({ value: record._id, title: recordLabel(record, resource, _.get(reference, 'label', ''), locale) })), item => _.toLower(item.title))
        // a record that is gone is still shown, by its id, so that the link is not lost without being seen
        return ref.id && !_.some(items, { value: ref.id }) && !this.loadingRecords ? [{ value: ref.id, title: `${ref.id} (${this.$filters.translate('TL_MAP_RECORD_MISSING')})` }, ...items] : items
      },
      /** @returns {Array<{key: string, label: string, value: number}>} the numbers that say where the selected area is, in percent of the picture */
      positionFields () {
        const c = _.get(this.current, 'coords')
        const percent = value => _.round(value * 100, 1)
        if (!c) {
          return []
        }
        if (this.current.shape === 'rect') {
          return [
            { key: 'left', label: 'TL_CROP_LEFT', value: percent(c[0]) },
            { key: 'top', label: 'TL_CROP_TOP', value: percent(c[1]) },
            { key: 'width', label: 'TL_WIDTH', value: percent(c[2] - c[0]) },
            { key: 'height', label: 'TL_HEIGHT', value: percent(c[3] - c[1]) }
          ]
        }
        return this.current.shape === 'circle' ? [
          { key: 'x', label: 'TL_MAP_X', value: percent(c[0]) },
          { key: 'y', label: 'TL_MAP_Y', value: percent(c[1]) },
          { key: 'radius', label: 'TL_MAP_RADIUS', value: percent(c[2]) }
        ] : []
      },
      /** @returns {number} how many areas have an address the server would refuse */
      problems () {
        return _.filter(this.areas, this.isBad).length
      }
    },
    watch: {
      modelValue (open) {
        if (open) {
          this.syncState()
        }
      },
      selected () {
        this.ensureRef()
      },
      'current.ref.resource' (resource) {
        if (resource) {
          this.loadRecords(resource)
        }
      }
    },
    created () {
      this.syncState()
    },
    mounted () {
      window.addEventListener('resize', this.measure)
    },
    beforeUnmount () {
      window.removeEventListener('resize', this.measure)
    },
    methods: {
      isSafeHref,
      linkText,
      svgPoints,
      /** Takes the state of the tool from the map kept with the picture, each time it opens. */
      syncState () {
        const areas = _.map(readAreas(this.imageMap), area => ({ ...area, _kind: kindOf(area, this.kinds) }))
        Object.assign(this, { ready: false, loadError: false, areas, selected: -1, tool: 'select', draft: null, drawStart: null, points: [], pointer: null, drag: null, refreshed: {} })
        // the records the areas point to are loaded, to show them by name in the list
        _.each(_.uniq(_.compact(_.map(this.areas, 'ref.resource'))), resource => this.loadRecords(resource))
      },
      /**
       * @param {string|Object|undefined} text a word of the field, or one per language
       * @returns {string} in the language of the person, empty when the field gives none
       */
      translated (text) {
        return text ? this.$filters.translate(text) : ''
      },
      /**
       * @param {string|undefined} resource
       * @returns {string} what the field calls records of that resource (its `title`), empty when it gives none
       */
      referenceTitle (resource) {
        return this.translated(_.get(_.find(this.references, { resource }), 'title'))
      },
      /**
       * @param {'url'|'record'|'value'} kind
       * @returns {string} the word on the button of that kind of link: the field's own (`labels`), else the title of its only resource, else the usual one
       */
      kindLabel (kind) {
        const own = this.translated(this.labels[kind])
        if (own) {
          return own
        }
        if (kind === 'record' && this.references.length === 1 && this.referenceTitle(this.references[0].resource)) {
          return this.referenceTitle(this.references[0].resource)
        }
        return this.$filters.translate({ url: 'TL_MAP_LINK_URL', record: 'TL_MAP_LINK_RECORD', value: 'TL_MAP_LINK_VALUE' }[kind])
      },
      /**
       * @param {Object} area
       * @returns {boolean} whether it links to an address the server would refuse
       */
      isBad (area) {
        return area._kind === 'url' && !isSafeHref(area.href)
      },
      /**
       * @param {Object} area
       * @returns {string} what it is called in the list: its title for an address, the record it points to, the value
       */
      rowName (area) {
        const name = area._kind === 'record' ? this.linkLabel(area) : area._kind === 'value' ? _.trim(area.value) : area.title
        return name || this.$filters.translate('TL_MAP_UNTITLED')
      },
      /**
       * @param {Object} area
       * @returns {string} the address of an area that links to one, shown after its name
       */
      rowLink (area) {
        return area._kind === 'url' ? area.href || '' : ''
      },
      /** The selected area of a field that has only records has a record to fill in (the form of a record needs the place to put it). */
      ensureRef () {
        if (this.current && this.current._kind === 'record' && !this.current.ref) {
          this.current.ref = { resource: _.get(this.references, '[0].resource', ''), id: '' }
        }
      },
      /**
       * @param {Object} area
       * @returns {string} where it links, as text: its address, or the name of the record it points to (its id while the records are not there)
       */
      linkLabel (area) {
        const ref = area.ref
        const record = ref && ref.id ? _.find(this.records[ref.resource], { _id: ref.id }) : undefined
        if (!record) {
          return ref && ref.id ? linkText(area) : ''
        }
        const reference = _.find(this.references, { resource: ref.resource })
        const locale = _.get(this.schema, 'userLocale') || _.get(this.schema, 'locale') || 'enUS'
        return recordLabel(record, ResourceService.getSchema(ref.resource), _.get(reference, 'label', ''), locale)
      },
      /** @param {Event} event the picture is loaded: its size is the unit of the coordinates the overlay is drawn in */
      onLoad (event) {
        const image = event.target
        this.size = { width: image.naturalWidth || image.width || 1000, height: image.naturalHeight || image.height || 1000 }
        this.ready = true
        this.$nextTick(this.measure)
      },
      onError () {
        this.loadError = true
      },
      /** Fits the picture to the room the stage has, and takes how wide it is shown (the handles and the numbers on it do not follow the picture). */
      async measure () {
        const stage = this.$refs.stage
        const space = (side) => (stage ? parseFloat(getComputedStyle(stage)[`padding${side}`]) || 0 : 0)
        const room = stage && this.ready ? { width: stage.clientWidth - space('Left') - space('Right'), height: stage.clientHeight - space('Top') - space('Bottom') } : null
        this.fit = room && room.width > 0 && room.height > 0 ? _.clamp(Math.min(room.width / this.size.width, room.height / this.size.height), 0.01, MAX_ZOOM) : 0
        await this.$nextTick()
        this.shownWidth = this.$refs.canvas ? this.$refs.canvas.clientWidth : 0
      },
      /**
       * @param {PointerEvent} event
       * @returns {{x: number, y: number}} where it is on the picture, as fractions
       */
      toPoint (event) {
        const box = this.$refs.overlay.getBoundingClientRect()
        return box.width && box.height ? { x: clamp01((event.clientX - box.left) / box.width), y: clamp01((event.clientY - box.top) / box.height) } : { x: 0, y: 0 }
      },
      /**
       * @param {Event} event on the picture
       * @returns {string|null} the handle it is on (see handlesOf), null when it is on something else
       */
      handleOf (event) {
        const target = event.target
        return target && target.getAttribute ? target.getAttribute('data-handle') : null
      },
      /** @param {PointerEvent} event keeps the pointer for a drag that leaves the picture */
      capture (event) {
        const overlay = this.$refs.overlay
        if (overlay && overlay.setPointerCapture && event.pointerId !== undefined) {
          try {
            overlay.setPointerCapture(event.pointerId)
          } catch {
            // the pointer is gone already: nothing to keep
          }
        }
      },
      /** @param {PointerEvent} event */
      onDown (event) {
        if (event.button) {
          return
        }
        const point = this.toPoint(event)
        this.$refs.overlay.focus()
        if (this.tool === 'poly') {
          this.clickPolygon(point)
          return
        }
        if (this.tool === 'select') {
          const handle = this.handleOf(event)
          if (handle && this.current) {
            this.drag = { mode: 'handle', key: handle, startArea: _.cloneDeep(this.current) }
            this.capture(event)
            return
          }
          this.selected = areaAt(this.areas, point, this.size)
          if (this.current) {
            this.drag = { mode: 'move', start: point, startArea: _.cloneDeep(this.current) }
            this.capture(event)
          }
          return
        }
        this.drawStart = point
        this.draft = this.draftFrom(point, point)
        this.capture(event)
      },
      /** @param {PointerEvent} event */
      onMove (event) {
        if (!this.drag && !this.draft && !this.points.length) {
          return
        }
        const point = this.toPoint(event)
        this.pointer = point
        if (this.draft) {
          this.draft = this.draftFrom(this.drawStart, point)
        } else if (this.drag && this.current) {
          const start = this.drag.startArea
          this.areas[this.selected] = this.drag.mode === 'move' ? moveArea(start, point.x - this.drag.start.x, point.y - this.drag.start.y, this.size) : dragHandle(start, this.drag.key, point, this.size)
        }
      },
      onUp () {
        if (this.draft) {
          const draft = this.draft
          this.draft = null
          this.drawStart = null
          if (isBigEnough(draft, this.size)) {
            this.addArea(draft)
          }
        }
        this.drag = null
      },
      /**
       * @param {{x: number, y: number}} start
       * @param {{x: number, y: number}} point
       * @returns {Object} the rectangle or circle the tool draws from where the drag began to where it is
       */
      draftFrom (start, point) {
        return this.tool === 'rect' ? { shape: 'rect', coords: rectFromPoints(start, point) } : { shape: 'circle', coords: circleFromPoints(start, point, this.size) }
      },
      /** @param {{x: number, y: number}} point a click while drawing a polygon: a point more, or the end when it is on the first one */
      clickPolygon (point) {
        const first = this.points[0]
        if (first && this.points.length >= 3 && Math.hypot((point.x - first.x) * this.shownWidth, (point.y - first.y) * this.shownWidth * this.size.height / this.size.width) < CLOSE_DISTANCE) {
          this.finishPolygon()
          return
        }
        this.points.push(point)
      },
      /** The polygon being drawn becomes an area (a double click adds the last point twice: one is dropped). */
      finishPolygon () {
        const points = [...this.points]
        const [last, before] = [_.last(points), points[points.length - 2]]
        if (last && before && Math.hypot(last.x - before.x, last.y - before.y) < 0.005) {
          points.pop()
        }
        this.points = []
        this.pointer = null
        if (points.length >= 3) {
          this.addArea({ shape: 'poly', coords: _.flatMap(points, point => [_.round(point.x, 5), _.round(point.y, 5)]) })
        }
      },
      /** @param {MouseEvent} event a double click ends a polygon, and takes a point of the selected one away */
      onDoubleClick (event) {
        if (this.tool === 'poly') {
          this.finishPolygon()
          return
        }
        const handle = this.handleOf(event)
        if (handle && /^p\d+$/.test(handle) && this.current) {
          const reduced = removePoint(this.current, Number(handle.slice(1)))
          if (reduced) {
            this.areas[this.selected] = reduced
          }
        }
      },
      /** Stops what is being drawn. */
      cancelDrawing () {
        this.draft = null
        this.drawStart = null
        this.points = []
        this.pointer = null
      },
      /** @param {string} tool */
      setTool (tool) {
        this.cancelDrawing()
        this.tool = tool
        if (tool !== 'select') {
          this.selected = -1
        }
        this.$nextTick(() => this.$refs.overlay && this.$refs.overlay.focus())
      },
      /** @param {Object} area a shape, new: it is made the first (on top) and selected, and its title is asked for */
      addArea (area) {
        this.areas.unshift({ ...area, id: newId(this.areas), title: '', href: '', target: '_self', _kind: this.kinds[0] })
        this.selected = 0
        this.ensureRef()
        this.tool = 'select'
        this.$nextTick(() => {
          const field = document.getElementById(`${this.titleId}-title`)
          if (field) {
            field.focus()
          }
        })
      },
      /** @param {string} shape adds one in the middle of the picture, to be placed with the numbers or the arrow keys (the way to add an area without a pointer) */
      addDefault (shape) {
        const shapes = {
          rect: { shape: 'rect', coords: [0.35, 0.35, 0.65, 0.65] },
          circle: { shape: 'circle', coords: [0.5, 0.5, 0.1] },
          poly: { shape: 'poly', coords: [0.5, 0.3, 0.7, 0.7, 0.3, 0.7] }
        }
        this.cancelDrawing()
        this.addArea(shapes[shape])
      },
      /** @param {number} index */
      select (index) {
        this.cancelDrawing()
        this.tool = 'select'
        this.selected = index
        this.ensureRef()
      },
      /** @param {number} index */
      remove (index) {
        this.areas.splice(index, 1)
        this.selected = _.clamp(this.selected > index ? this.selected - 1 : this.selected === index ? -1 : this.selected, -1, this.areas.length - 1)
      },
      /**
       * @param {number} index
       * @param {number} delta -1 above the others (first), 1 below: where areas overlap, the first one is what a click gets
       */
      move (index, delta) {
        const to = index + delta
        if (to < 0 || to >= this.areas.length) {
          return
        }
        this.areas.splice(to, 0, this.areas.splice(index, 1)[0])
        if (this.selected === index) {
          this.selected = to
        } else if (this.selected === to) {
          this.selected = index
        }
      },
      clear () {
        this.areas = []
        this.selected = -1
        this.cancelDrawing()
      },
      /** @param {KeyboardEvent} event on the picture: Escape, Enter, Delete and the arrows */
      onKey (event) {
        const drawing = !!(this.draft || this.points.length)
        if (event.key === 'Escape' && (drawing || this.current)) {
          event.stopPropagation()
          event.preventDefault()
          if (drawing) {
            this.cancelDrawing()
          } else {
            this.selected = -1
          }
        } else if (event.key === 'Enter' && this.points.length) {
          event.preventDefault()
          this.finishPolygon()
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          if (this.points.length) {
            this.points.pop()
          } else if (this.current) {
            this.remove(this.selected)
          }
        } else if (this.current && this.tool === 'select' && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
          event.preventDefault()
          const step = event.shiftKey ? NUDGE * 10 : NUDGE
          const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
          const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
          this.areas[this.selected] = moveArea(this.current, dx, dy, this.size)
        }
      },
      /**
       * @param {'url'|'record'|'value'} kind how the selected area links now: what it linked to before is let go (one kind at a time)
       */
      setLinkKind (kind) {
        const area = this.current
        area._kind = kind
        if (kind !== 'url') {
          area.href = ''
        }
        if (kind !== 'value') {
          area.value = ''
        }
        if (kind === 'record') {
          area.ref = { resource: _.get(this.references, '[0].resource', ''), id: '' }
        } else {
          delete area.ref
        }
      },
      /** @param {string} resource the resource the link points to now: the record is chosen again */
      setReferenceResource (resource) {
        this.current.ref = { resource, id: '' }
      },
      /**
       * Loads the records of a resource a link can point to: the ones the admin has are there at once, and the list is asked for again, once each
       * time the tool opens (what the admin kept can be old, or empty).
       * @param {string} resource
       */
      async loadRecords (resource) {
        const cached = ResourceService.get(resource)
        if (cached && !this.records[resource]) {
          this.records = { ...this.records, [resource]: cached }
        }
        if (this.refreshed[resource]) {
          return
        }
        this.refreshed = { ...this.refreshed, [resource]: true }
        this.loadingRecords = true
        try {
          const list = await ResourceService.cache(resource)
          this.records = { ...this.records, [resource]: list || [] }
        } catch (error) {
          console.error(`Could not load the records of ${resource}:`, error)
          if (!cached) {
            this.records = { ...this.records, [resource]: [] }
          }
        } finally {
          this.loadingRecords = false
        }
      },
      /**
       * Places the selected area by a number typed in.
       * @param {string} key left, top, width, height (a rectangle), x, y or radius (a circle)
       * @param {Event} event the field was changed, in percent
       */
      setPosition (key, event) {
        if (event.target.value === '' || !_.isFinite(Number(event.target.value)) || !this.current) {
          return
        }
        const value = clamp01(Number(event.target.value) / 100)
        const c = [...this.current.coords]
        if (this.current.shape === 'rect') {
          const [width, height] = [c[2] - c[0], c[3] - c[1]]
          const next = {
            left: () => { c[0] = Math.min(value, 1 - width); c[2] = c[0] + width },
            top: () => { c[1] = Math.min(value, 1 - height); c[3] = c[1] + height },
            width: () => { c[2] = c[0] + _.clamp(value, MIN_SIZE, 1 - c[0]) },
            height: () => { c[3] = c[1] + _.clamp(value, MIN_SIZE, 1 - c[1]) }
          }
          next[key]()
        } else {
          const next = { x: () => { c[0] = value }, y: () => { c[1] = value }, radius: () => { c[2] = Math.max(value, MIN_SIZE) } }
          next[key]()
        }
        this.current.coords = _.map(c, number => _.round(number, 5))
      },
      /** @param {string} shape @returns {string} its icon */
      shapeIcon (shape) {
        return { rect: '$squareOutline', circle: '$circleOutline', poly: '$vectorPolygon' }[shape]
      },
      /** Gives back the map, with the flag that makes the record editor send it. */
      apply () {
        if (this.problems) {
          return
        }
        this.$emit('apply', buildMap(_.map(this.areas, area => this.kept(area))))
        this.close()
      },
      /**
       * @param {Object} area as it is in the tool
       * @returns {Object} what is kept of it: the link of its kind only, and where it opens only when the field asks (an address always)
       */
      kept (area) {
        const kept = _.omit(area, ['_kind'])
        if (area._kind !== 'url') {
          delete kept.href
        }
        if (area._kind !== 'record') {
          delete kept.ref
        }
        if (area._kind !== 'value') {
          delete kept.value
        }
        if (!(area._kind === 'url' || (area._kind === 'record' && this.openIn))) {
          kept.target = '_self'
        }
        return kept
      },
      close () {
        this.$emit('update:modelValue', false)
      },
      /** @param {boolean} open */
      onUpdate (open) {
        this.$emit('update:modelValue', open)
      }
    }
  }
</script>

<style lang="scss">
.map-dialog {
  // a height of its own: the modal does not grow and shrink with what is selected, the panel on the side scrolls inside it
  // (Vuetify gives the card of a dialog a flex basis of its own, which a height does not beat)
  &.v-dialog > .v-overlay__content > .map-card {
    flex: 0 0 auto;
  }
  .map-card {
    display: flex;
    flex-direction: column;
    height: min(92vh, 820px);
    background: var(--cms-surface);
    color: var(--cms-text);
    border-radius: var(--cms-radius-lg);
  }
  .map-title {
    margin: 0;
    padding: var(--cms-space-4) var(--cms-space-6);
    font-size: var(--cms-fs-lg);
    font-weight: var(--cms-fw-semibold);
    border-bottom: 1px solid var(--cms-border);
  }
  .map-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: var(--cms-space-4);
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    padding: var(--cms-space-4) var(--cms-space-6);
  }
  .map-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: var(--cms-space-2);
    border-radius: var(--cms-radius-md);
    background: var(--cms-checker);
  }
  // the box takes the size of the picture, so that the overlay laid over it is exactly the picture
  .map-canvas {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
  }
  .map-canvas.is-fitted .map-image {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
  }
  .map-image {
    display: block;
    max-width: 100%;
    // the room the stage has: the height of the modal less its title, its foot and the space around the picture
    max-height: calc(min(92vh, 820px) - 170px);
    width: auto;
    height: auto;
    user-select: none;
  }
  .map-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
    outline: none;
    &.is-select {
      cursor: default;
    }
    &:not(.is-select) {
      cursor: crosshair;
    }
    &:focus-visible {
      outline: 2px solid var(--cms-focus-ring);
      outline-offset: 2px;
    }
  }
  .map-area {
    rect, circle, polygon, polyline {
      fill: var(--cms-primary);
      fill-opacity: 0.28;
      stroke: var(--cms-on-image-control);
      stroke-width: 2px;
      vector-effect: non-scaling-stroke;
    }
    polyline {
      fill: none;
    }
    &.is-selected {
      rect, circle, polygon {
        fill-opacity: 0.45;
        stroke-width: 3px;
      }
    }
    &.is-draft {
      rect, circle, polygon, polyline {
        stroke-dasharray: 6 4;
      }
    }
  }
  .map-number {
    fill: var(--cms-on-image-control);
    stroke: var(--cms-image-control-bg);
    stroke-width: 3px;
    paint-order: stroke;
    font-weight: var(--cms-fw-bold);
    pointer-events: none;
    user-select: none;
  }
  .map-area rect.map-handle,
  .map-handles rect.map-handle {
    fill: var(--cms-on-image-control);
    fill-opacity: 1;
    stroke: var(--cms-primary);
    stroke-width: 2px;
    stroke-dasharray: none;
    cursor: pointer;
    &.is-first {
      fill: var(--cms-primary);
      stroke: var(--cms-on-image-control);
    }
  }
  .map-tools {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-4);
    min-width: 0;
    min-height: 0;
    padding-right: var(--cms-space-1);
    overflow-y: auto;
  }
  .map-section {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-2);
  }
  .map-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cms-space-2);
  }
  .map-heading {
    margin: 0;
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
    color: var(--cms-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .map-subheading {
    margin: var(--cms-space-2) 0 0;
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
    color: var(--cms-text-muted);
  }
  .map-choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-2);
  }
  .map-hint,
  .map-empty {
    margin: 0;
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
  }
  .map-error {
    margin: 0;
    font-size: var(--cms-fs-sm);
    color: var(--cms-error);
  }
  .map-stage .map-error {
    align-self: center;
  }
  .map-list {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-1);
    max-height: 170px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  .map-row {
    display: flex;
    align-items: center;
    gap: var(--cms-space-1);
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-md);
    &.is-selected {
      border-color: var(--cms-primary);
      background: var(--cms-primary-soft);
    }
    &.has-problem {
      border-color: var(--cms-error);
    }
  }
  .map-pick {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--cms-space-2);
    min-width: 0;
    padding: var(--cms-space-2);
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    &:focus-visible {
      outline: 2px solid var(--cms-focus-ring);
      outline-offset: -2px;
    }
  }
  .map-number-label {
    font-weight: var(--cms-fw-bold);
  }
  .map-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .map-link-text {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--cms-text-muted);
    font-size: var(--cms-fs-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  // real labels, outside the fields (Vuetify's own floating label is not tied to its input, which browsers flag)
  .map-field {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--cms-space-1);
    min-width: 0;
  }
  .map-label {
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
  }
  .map-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cms-space-2);
  }
  .map-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-2);
    padding: var(--cms-space-3) var(--cms-space-6);
    border-top: 1px solid var(--cms-border);
  }
  .map-foot .v-btn.apply {
    color: var(--cms-on-primary);
  }
  // on a narrow screen the picture and the panel are one under the other, and the page of the modal scrolls
  @media (max-width: 900px) {
    .map-body {
      grid-template-columns: minmax(0, 1fr);
      overflow-y: auto;
    }
    .map-stage {
      height: 46vh;
      min-height: 200px;
    }
    .map-image {
      max-height: 46vh;
    }
    .map-tools {
      overflow: visible;
    }
  }
}
</style>
