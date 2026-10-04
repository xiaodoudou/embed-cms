<template>
  <v-dialog
    :model-value="modelValue" class="crop-dialog" max-width="1100" scrollable :aria-labelledby="titleId"
    @update:model-value="onUpdate"
  >
    <v-card class="crop-card">
      <h2 :id="titleId" class="crop-title">{{ title }}</h2>
      <div class="crop-body">
        <div class="crop-stage">
          <cropper
            v-if="modelValue"
            ref="cropper" class="crop-cropper"
            :src="src" :stencil-component="stencilComponent" :stencil-props="stencilProps" v-bind="startProps" :debounce="60" :transitions="true" image-restriction="fit-area" default-boundaries="fill"
            @change="onChange" @ready="onReady" @error="onError"
          />
          <p v-if="loadError" class="crop-error" role="alert">{{ $filters.translate('TL_LOADING_ERROR') }}</p>
        </div>
        <div class="crop-tools">
          <section v-if="!locked" class="crop-section" role="group" :aria-labelledby="`${titleId}-ratio`">
            <h3 :id="`${titleId}-ratio`" class="crop-heading">{{ $filters.translate('TL_CROP_SHAPE') }}</h3>
            <div class="crop-choices">
              <v-btn
                v-for="choice in choices" :key="choice.key"
                class="crop-ratio" :class="{ 'is-selected': ratioKey === choice.key }" size="small" rounded :variant="ratioKey === choice.key ? 'flat' : 'outlined'" :color="ratioKey === choice.key ? 'primary' : undefined"
                :aria-pressed="ratioKey === choice.key ? 'true' : 'false'" @click="chooseRatio(choice.key)"
              >
                {{ choice.kind === 'ratio' ? choice.label : $filters.translate(choice.kind === 'free' ? 'TL_CROP_FREE' : 'TL_CROP_ORIGINAL') }}
              </v-btn>
              <v-btn
                class="crop-ratio crop-custom" :class="{ 'is-selected': ratioKey === 'custom' }" size="small" rounded :variant="ratioKey === 'custom' ? 'flat' : 'outlined'" :color="ratioKey === 'custom' ? 'primary' : undefined"
                :aria-pressed="ratioKey === 'custom' ? 'true' : 'false'" @click="chooseRatio('custom')"
              >
                {{ $filters.translate('TL_CROP_CUSTOM') }}
              </v-btn>
            </div>
            <div v-if="ratioKey === 'custom'" class="crop-pair crop-custom-ratio">
              <div class="crop-field">
                <label :id="`${titleId}-custom-width-label`" :for="`${titleId}-custom-width`" class="crop-label">{{ $filters.translate('TL_WIDTH') }}</label>
                <v-text-field :id="`${titleId}-custom-width`" v-model.number="customWidth" name="crop-ratio-width" type="number" min="1" density="compact" variant="outlined" hide-details />
              </div>
              <span class="crop-colon" aria-hidden="true">:</span>
              <div class="crop-field">
                <label :id="`${titleId}-custom-height-label`" :for="`${titleId}-custom-height`" class="crop-label">{{ $filters.translate('TL_HEIGHT') }}</label>
                <v-text-field :id="`${titleId}-custom-height`" v-model.number="customHeight" name="crop-ratio-height" type="number" min="1" density="compact" variant="outlined" hide-details />
              </div>
            </div>
          </section>

          <section class="crop-section" role="group" :aria-labelledby="`${titleId}-image`">
            <h3 :id="`${titleId}-image`" class="crop-heading">{{ $filters.translate('TL_CROP_IMAGE') }}</h3>
            <div class="crop-actions">
              <v-btn class="crop-rotate-left" icon variant="outlined" size="small" :aria-label="$filters.translate('TL_CROP_ROTATE_LEFT')" :title="$filters.translate('TL_CROP_ROTATE_LEFT')" @click="rotate(-90)"><v-icon icon="$rotateLeft" /></v-btn>
              <v-btn class="crop-rotate-right" icon variant="outlined" size="small" :aria-label="$filters.translate('TL_CROP_ROTATE_RIGHT')" :title="$filters.translate('TL_CROP_ROTATE_RIGHT')" @click="rotate(90)"><v-icon icon="$rotateRight" /></v-btn>
              <v-btn class="crop-flip-x" icon variant="outlined" size="small" :aria-label="$filters.translate('TL_CROP_FLIP_HORIZONTAL')" :title="$filters.translate('TL_CROP_FLIP_HORIZONTAL')" :aria-pressed="transforms.flipX ? 'true' : 'false'" :color="transforms.flipX ? 'primary' : undefined" @click="flip(true, false)"><v-icon icon="$flipHorizontal" /></v-btn>
              <v-btn class="crop-flip-y" icon variant="outlined" size="small" :aria-label="$filters.translate('TL_CROP_FLIP_VERTICAL')" :title="$filters.translate('TL_CROP_FLIP_VERTICAL')" :aria-pressed="transforms.flipY ? 'true' : 'false'" :color="transforms.flipY ? 'primary' : undefined" @click="flip(false, true)"><v-icon icon="$flipVertical" /></v-btn>
              <v-btn class="crop-zoom-out" icon variant="outlined" size="small" :aria-label="$filters.translate('TL_CROP_ZOOM_OUT')" :title="$filters.translate('TL_CROP_ZOOM_OUT')" @click="zoom(0.8)"><v-icon icon="$magnifyMinusOutline" /></v-btn>
              <v-btn class="crop-zoom-in" icon variant="outlined" size="small" :aria-label="$filters.translate('TL_CROP_ZOOM_IN')" :title="$filters.translate('TL_CROP_ZOOM_IN')" @click="zoom(1.25)"><v-icon icon="$magnifyPlusOutline" /></v-btn>
            </div>
          </section>

          <section class="crop-section" role="group" :aria-labelledby="`${titleId}-area`">
            <h3 :id="`${titleId}-area`" class="crop-heading">{{ $filters.translate('TL_CROP_AREA') }}</h3>
            <div class="crop-grid">
              <div v-for="field in areaFields" :key="field.key" class="crop-field" :class="`crop-area-${field.key}`">
                <label :id="`${titleId}-${field.key}-label`" :for="`${titleId}-${field.key}`" class="crop-label">{{ $filters.translate(field.label) }}</label>
                <v-text-field :id="`${titleId}-${field.key}`" :name="`crop-area-${field.key}`" :model-value="Math.round(rect[field.key])" type="number" min="0" density="compact" variant="outlined" hide-details suffix="px" @change="setArea(field.key, $event)" />
              </div>
            </div>
          </section>

          <section class="crop-section" role="group" :aria-labelledby="`${titleId}-output`">
            <h3 :id="`${titleId}-output`" class="crop-heading">{{ $filters.translate('TL_CROP_OUTPUT') }}</h3>
            <div v-if="size" class="crop-fixed">{{ $filters.translate('TL_CROP_FIXED_SIZE') }}: {{ size.width }} × {{ size.height }} px</div>
            <div v-else class="crop-pair">
              <div class="crop-field crop-max-width">
                <label :id="`${titleId}-max-width-label`" :for="`${titleId}-max-width`" class="crop-label">{{ $filters.translate('TL_CROP_MAX_WIDTH') }}</label>
                <v-text-field :id="`${titleId}-max-width`" v-model.number="maxWidth" name="crop-max-width" type="number" min="1" density="compact" variant="outlined" hide-details suffix="px" />
              </div>
              <div class="crop-field crop-max-height">
                <label :id="`${titleId}-max-height-label`" :for="`${titleId}-max-height`" class="crop-label">{{ $filters.translate('TL_CROP_MAX_HEIGHT') }}</label>
                <v-text-field :id="`${titleId}-max-height`" v-model.number="maxHeight" name="crop-max-height" type="number" min="1" density="compact" variant="outlined" hide-details suffix="px" />
              </div>
            </div>
            <div class="crop-pair">
              <div class="crop-field crop-format">
                <label :id="`${titleId}-format-label`" :for="`${titleId}-format`" class="crop-label">{{ $filters.translate('TL_CROP_FORMAT') }}</label>
                <v-select :id="`${titleId}-format`" v-model="format" name="crop-format" :items="formatItems" density="compact" variant="outlined" hide-details />
              </div>
              <div v-if="hasQuality" class="crop-field crop-quality">
                <label :id="`${titleId}-quality-label`" :for="`${titleId}-quality`" class="crop-label">{{ $filters.translate('TL_CROP_QUALITY') }}</label>
                <v-text-field :id="`${titleId}-quality`" v-model.number="quality" name="crop-quality" type="number" min="1" max="100" density="compact" variant="outlined" hide-details suffix="%" />
              </div>
            </div>
            <div v-if="!shapeLocked" class="crop-choices crop-shapes">
              <v-btn class="crop-shape-rect" size="small" rounded :variant="shape === 'rect' ? 'flat' : 'outlined'" :color="shape === 'rect' ? 'primary' : undefined" :aria-pressed="shape === 'rect' ? 'true' : 'false'" @click="shape = 'rect'"><v-icon icon="$squareOutline" start />{{ $filters.translate('TL_CROP_RECTANGLE') }}</v-btn>
              <v-btn class="crop-shape-circle" size="small" rounded :variant="shape === 'circle' ? 'flat' : 'outlined'" :color="shape === 'circle' ? 'primary' : undefined" :aria-pressed="shape === 'circle' ? 'true' : 'false'" @click="shape = 'circle'"><v-icon icon="$circleOutline" start />{{ $filters.translate('TL_CROP_CIRCLE') }}</v-btn>
            </div>
            <p class="crop-result" aria-live="polite">
              {{ $filters.translate('TL_CROP_RESULT') }}: <strong>{{ result.width }} × {{ result.height }} px</strong>
              <span v-if="enlarged" class="crop-warning">{{ $filters.translate('TL_CROP_ENLARGED', { width: Math.round(rect.width), height: Math.round(rect.height) }) }}</span>
            </p>
          </section>
        </div>
      </div>
      <div class="crop-foot">
        <v-btn v-if="suggest" class="crop-auto" variant="outlined" rounded :loading="suggesting" :disabled="!ready" @click="autoCrop"><v-icon icon="$autoFix" start />{{ $filters.translate('TL_CROP_AUTO') }}</v-btn>
        <v-btn class="crop-reset" variant="outlined" rounded :disabled="!ready" @click="reset"><v-icon icon="$restore" start />{{ $filters.translate('TL_CROP_RESET') }}</v-btn>
        <p v-if="suggestError" class="crop-error" role="alert">{{ $filters.translate('TL_CROP_AUTO_FAILED') }}</p>
        <v-spacer />
        <v-btn v-if="stored" class="crop-remove" variant="text" rounded @click="removeCrop">{{ $filters.translate('TL_CROP_REMOVE') }}</v-btn>
        <v-btn class="crop-cancel" variant="outlined" rounded @click="close">{{ $filters.translate('TL_CANCEL') }}</v-btn>
        <v-btn class="apply crop-apply" variant="flat" color="primary" rounded :disabled="!ready" @click="apply">{{ $filters.translate('TL_APPLY_CROP') }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script>
  import _ from 'lodash'
  import { Cropper, CircleStencil, RectangleStencil } from 'vue-advanced-cropper'
  import 'vue-advanced-cropper/dist/style.css'
  import { renderPreview } from '@u/cropPreview'
  import { buildRecipe, fixedSize, hasCrop, lockedRatio, parseRatio, ratioChoices, readRecipe, resultSize, FORMATS } from '@u/cropRecipe'

  let dialogCounter = 0

  /**
   * The crop tool, in a modal: the part of the picture to keep (a ratio, free or chosen from a list, or a size the field fixes), turned
   * and flipped, with the size, format and shape of the result. It gives back the recipe the API cuts the image by (see utils/cropRecipe.js);
   * nothing is cut here and the original is not touched.
   */
  export default {
    components: { Cropper },
    props: {
      modelValue: { type: Boolean, default: false },
      title: { type: String, default: '' },
      // the picture: its address, or its data url before it is uploaded
      src: { type: String, default: '' },
      // the field: width and height (or aspectRatio) fix the shape, aspectRatios list the choices, output and shape give the defaults
      schema: { type: Object, default: () => ({}) },
      // the crop kept with the picture, when there is one
      cropOptions: { type: Object, default: undefined },
      // (aspect, { rotate, flipX, flipY }) => Promise<{ left, top, width, height }>: where smart cropping would put it; no button without it
      suggest: { type: Function, default: undefined }
    },
    emits: ['update:modelValue', 'apply'],
    data () {
      dialogCounter++
      return {
        titleId: `cms-crop-title-${dialogCounter}`,
        ready: false,
        loadError: false,
        suggesting: false,
        suggestError: false,
        // the picture, as it is before any turn
        imageSize: { width: 0, height: 0 },
        // what the cropper says: the part kept, and how the picture is turned
        rect: { left: 0, top: 0, width: 0, height: 0 },
        transforms: { rotate: 0, flipX: false, flipY: false },
        ratioKey: 'free',
        customWidth: 1,
        customHeight: 1,
        shape: 'rect',
        format: '',
        quality: 85,
        maxWidth: null,
        maxHeight: null,
        areaFields: [
          { key: 'left', label: 'TL_CROP_LEFT' },
          { key: 'top', label: 'TL_CROP_TOP' },
          { key: 'width', label: 'TL_WIDTH' },
          { key: 'height', label: 'TL_HEIGHT' }
        ]
      }
    },
    computed: {
      /** @returns {Array<Object>} the shapes to choose from */
      choices () {
        return ratioChoices(this.schema)
      },
      /** @returns {number|null} the one ratio the field allows */
      locked () {
        return lockedRatio(this.schema)
      },
      /** @returns {{width: number, height: number}|null} the size the field fixes for the result */
      size () {
        return fixedSize(this.schema)
      },
      /** @returns {boolean} whether the field says the shape, so there is nothing to choose */
      shapeLocked () {
        return _.includes(['rect', 'circle'], _.get(this.schema, 'shape'))
      },
      /** @returns {boolean} whether the picture has a crop kept with it: it can be removed */
      stored () {
        return hasCrop(this.cropOptions)
      },
      /** @returns {Object} the cropper's shape component for the shape */
      stencilComponent () {
        return this.shape === 'circle' ? CircleStencil : RectangleStencil
      },
      /** @returns {number|null} width over height the crop has, null when it is free */
      aspect () {
        if (this.locked) {
          return this.locked
        }
        const choice = _.find(this.choices, { key: this.ratioKey })
        if (this.ratioKey === 'custom') {
          return parseRatio([this.customWidth, this.customHeight])
        }
        if (choice && choice.kind === 'original' && this.imageSize.width) {
          const sideways = this.transforms.rotate % 180 !== 0
          return sideways ? this.imageSize.height / this.imageSize.width : this.imageSize.width / this.imageSize.height
        }
        return choice ? choice.ratio : null
      },
      /** @returns {Object} the props of the cropper's shape */
      stencilProps () {
        return this.aspect ? { aspectRatio: this.aspect } : {}
      },
      /** @returns {Object} what the result is made of, as the recipe says it */
      output () {
        const output = {}
        if (this.size) {
          output.width = this.size.width
          output.height = this.size.height
        } else {
          output.maxWidth = this.maxWidth > 0 ? this.maxWidth : undefined
          output.maxHeight = this.maxHeight > 0 ? this.maxHeight : undefined
        }
        if (this.format) {
          output.format = this.format
        }
        if (this.hasQuality && this.quality > 0 && this.quality !== 85) {
          output.quality = this.quality
        }
        return _.omitBy(output, _.isUndefined)
      },
      /** @returns {{width: number, height: number}} the size of the result */
      result () {
        return resultSize({ width: Math.max(1, Math.round(this.rect.width)), height: Math.max(1, Math.round(this.rect.height)) }, this.output)
      },
      /** @returns {boolean} whether the part kept is smaller than the result: it is made larger */
      enlarged () {
        return this.ready && (this.result.width > Math.round(this.rect.width) + 1 || this.result.height > Math.round(this.rect.height) + 1)
      },
      /** @returns {boolean} whether the format has a quality (jpeg and webp, and the format of the original, which may be either) */
      hasQuality () {
        return _.includes(['', 'jpeg', 'webp'], this.format)
      },
      /** @returns {Array<{title: string, value: string}>} */
      formatItems () {
        return [{ title: this.$filters.translate('TL_CROP_FORMAT_ORIGINAL'), value: '' }, ..._.map(FORMATS, format => ({ title: format === 'jpeg' ? 'JPEG' : format.toUpperCase(), value: format }))]
      },
      /** @returns {Object} where the crop starts: the one kept with the picture and how it is turned, else the cropper's own (most of the picture) */
      startProps () {
        const stored = readRecipe(this.cropOptions)
        const props = { defaultTransforms: { rotate: stored.transforms.rotate, flip: { horizontal: stored.transforms.flipX, vertical: stored.transforms.flipY } } }
        if (stored.rect) {
          props.defaultSize = { width: stored.rect.width, height: stored.rect.height }
          props.defaultPosition = { left: stored.rect.left, top: stored.rect.top }
        }
        return props
      }
    },
    watch: {
      shape (shape) {
        // a round picture needs transparency: a jpeg has none
        if (shape === 'circle' && this.format === 'jpeg') {
          this.format = 'png'
        }
      },
      modelValue (open) {
        if (open) {
          this.syncState()
        }
      }
    },
    created () {
      this.syncState()
    },
    methods: {
      /** Takes the state of the tool from the crop kept with the picture (else from what the field says), each time the tool opens. */
      syncState () {
        const stored = readRecipe(this.cropOptions)
        const defaults = _.get(this.schema, 'output', {})
        const known = _.some(this.choices, { key: stored.ratio })
        const custom = !known && parseRatio(stored.ratio)
        const [customWidth, customHeight] = custom ? _.split(stored.ratio, ':') : [1, 1]
        Object.assign(this, {
          ready: false,
          loadError: false,
          suggestError: false,
          transforms: { ...stored.transforms },
          ratioKey: known ? stored.ratio : custom ? 'custom' : (_.some(this.choices, { key: 'free' }) ? 'free' : _.get(this.choices, '[0].key', 'free')),
          customWidth: Number(customWidth) || 1,
          customHeight: Number(customHeight) || 1,
          shape: _.get(this.schema, 'shape') === 'circle' ? 'circle' : stored.shape,
          format: stored.output.format || defaults.format || '',
          quality: stored.output.quality || defaults.quality || 85,
          maxWidth: stored.output.maxWidth || defaults.maxWidth || null,
          maxHeight: stored.output.maxHeight || defaults.maxHeight || null
        })
      },
      /** @param {{coordinates: Object, image: Object}} change from the cropper */
      onChange ({ coordinates, image }) {
        this.rect = { left: coordinates.left, top: coordinates.top, width: coordinates.width, height: coordinates.height }
        const flip = _.get(image, 'transforms.flip', {})
        this.transforms = { rotate: _.get(image, 'transforms.rotate', 0), flipX: !!flip.horizontal, flipY: !!flip.vertical }
        if (_.get(image, 'width')) {
          this.imageSize = { width: image.width, height: image.height }
        }
      },
      /** The picture is loaded and the crop placed. */
      onReady () {
        this.ready = true
      },
      onError () {
        this.loadError = true
      },
      /** @param {string} key the choice; a ratio the cropper has not yet is made to fit the part kept */
      chooseRatio (key) {
        this.ratioKey = key
      },
      /** @param {number} angle 90 or -90 */
      rotate (angle) {
        this.$refs.cropper.rotate(angle)
      },
      /**
       * @param {boolean} horizontal
       * @param {boolean} vertical
       */
      flip (horizontal, vertical) {
        this.$refs.cropper.flip(horizontal, vertical)
      },
      /** @param {number} factor more than 1 to come closer */
      zoom (factor) {
        this.$refs.cropper.zoom(factor)
      },
      /** The crop and the turns as they were when the picture was opened. */
      reset () {
        this.$refs.cropper.reset()
      },
      /**
       * @param {string} key left, top, width or height
       * @param {Event} event the field was changed
       */
      setArea (key, event) {
        // a field that was emptied says nothing (Number('') is 0)
        const value = event.target.value === '' ? NaN : Number(event.target.value)
        if (!_.isFinite(value) || (key === 'width' || key === 'height') && value < 1) {
          return
        }
        this.$refs.cropper.setCoordinates({ [key]: value })
      },
      /** Puts the crop where smart cropping would. */
      async autoCrop () {
        this.suggesting = true
        this.suggestError = false
        try {
          const aspect = this.aspect || (this.rect.width / this.rect.height)
          const area = await this.suggest(aspect, { rotate: this.transforms.rotate, flipX: this.transforms.flipX, flipY: this.transforms.flipY })
          this.$refs.cropper.setCoordinates(area)
        } catch (error) {
          console.error('Could not ask where to crop:', error)
          this.suggestError = true
        } finally {
          this.suggesting = false
        }
      },
      /** Gives back the recipe, and a small picture of the result to show until the picture is saved (drawn once, now, not at every move of the frame). */
      async apply () {
        // what the frame says now, with the last move still waiting for its change event if there is one
        const { coordinates, image } = this.$refs.cropper.getResult()
        this.rect = { left: coordinates.left, top: coordinates.top, width: coordinates.width, height: coordinates.height }
        const flip = _.get(image, 'transforms.flip', {})
        this.transforms = { rotate: _.get(image, 'transforms.rotate', 0), flipX: !!flip.horizontal, flipY: !!flip.vertical }
        // a ratio typed in is kept as it reads (4:3), so that it is there when the tool opens again
        const ratio = this.ratioKey === 'custom' ? `${this.customWidth}:${this.customHeight}` : this.ratioKey
        const cropOptions = buildRecipe({ rect: this.rect, transforms: this.transforms, shape: this.shape, output: this.output, ratio })
        let preview = ''
        try {
          preview = await renderPreview(this.src, cropOptions)
        } catch (error) {
          console.error('Could not draw the small picture of the crop:', error)
        }
        this.$emit('apply', cropOptions, preview)
        this.close()
      },
      /** Gives back an empty recipe: the picture is shown and served as it was uploaded. */
      removeCrop () {
        this.$emit('apply', { updated: true }, '')
        this.close()
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
.crop-dialog {
  .crop-card {
    display: flex;
    flex-direction: column;
    max-height: 92vh;
    background: var(--cms-surface);
    color: var(--cms-text);
    border-radius: var(--cms-radius-lg);
  }
  .crop-title {
    margin: 0;
    padding: var(--cms-space-4) var(--cms-space-6);
    font-size: var(--cms-fs-lg);
    font-weight: var(--cms-fw-semibold);
    border-bottom: 1px solid var(--cms-border);
  }
  .crop-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--cms-space-4);
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--cms-space-4) var(--cms-space-6);
  }
  .crop-stage {
    position: relative;
    min-width: 0;
    height: min(62vh, 560px);
    border-radius: var(--cms-radius-md);
    background: var(--cms-checker);
    overflow: hidden;
  }
  .crop-cropper {
    width: 100%;
    height: 100%;
  }
  .crop-tools {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-4);
    min-width: 0;
  }
  .crop-section {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-2);
  }
  .crop-heading {
    margin: 0;
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-semibold);
    color: var(--cms-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .crop-choices,
  .crop-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-2);
  }
  .crop-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cms-space-2);
  }
  .crop-pair {
    display: flex;
    align-items: flex-end;
    gap: var(--cms-space-2);
  }
  // the label is a real one, outside the field (Vuetify's own floating label is not tied to its input, which browsers flag)
  .crop-field {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--cms-space-1);
    min-width: 0;
  }
  .crop-label {
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
  }
  .crop-colon {
    padding-bottom: var(--cms-space-3);
  }
  .crop-fixed,
  .crop-result {
    margin: 0;
    font-size: var(--cms-fs-sm);
  }
  .crop-warning {
    display: block;
    color: var(--cms-warning);
  }
  .crop-error {
    margin: 0;
    color: var(--cms-error);
    font-size: var(--cms-fs-sm);
  }
  .crop-stage .crop-error {
    position: absolute;
    inset: auto 0 var(--cms-space-4);
    text-align: center;
  }
  .crop-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-2);
    padding: var(--cms-space-3) var(--cms-space-6);
    border-top: 1px solid var(--cms-border);
  }
  .crop-foot .v-btn.apply {
    color: var(--cms-on-primary);
  }
  @media (max-width: 860px) {
    .crop-body {
      grid-template-columns: minmax(0, 1fr);
    }
    .crop-stage {
      height: 46vh;
    }
  }
}
</style>
