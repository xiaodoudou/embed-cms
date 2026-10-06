<template>
  <div class="row-handle">
    <div v-if="isImage(attachment)" class="image-wrapper" :class="{ 'is-cropped': !!previewAspect, 'is-round': cropShape.round }" :style="previewAspect ? { maxWidth: `${Math.round(PREVIEW_HEIGHT * previewAspect)}px` } : undefined">
      <v-img cover :aspect-ratio="previewAspect || 16 / 10" :src="getImageSrc(attachment)" :class="{ clickable: viewable }" @click="viewFile()" @load="setLoadingError(false)" @error="setLoadingError(true)" />
      <!-- the areas of an image map, over the picture -->
      <image-map-overlay v-if="mapEnabled && mapAreas.length" :areas="mapAreas" :aspect="mapAspect || 16 / 10" />
    </div>
    <!-- the crop tool, in a modal (outside the picture, whose box cuts what overflows it) -->
    <template v-if="isImage(attachment) && cropEnabled">
      <v-btn class="edit-crop" variant="outlined" rounded size="small" @click="cropping = true">
        <v-icon icon="$crop" />{{ $filters.translate('TL_EDIT_CROP') }}
      </v-btn>
      <crop-dialog
        v-model="cropping" :title="$filters.translate(schema.label)" :src="imageUrl()" :schema="schema" :crop-options="attachment.cropOptions" :suggest="canSuggest ? suggest : undefined"
        @apply="onApply"
      />
    </template>
    <!-- the image map tool, in a modal -->
    <template v-if="isImage(attachment) && mapEnabled">
      <v-btn class="edit-map" variant="outlined" rounded size="small" @click="mapping = true">
        <v-icon icon="$vectorSquare" />{{ $filters.translate('TL_EDIT_MAP') }}
      </v-btn>
      <span v-if="mapAreas.length" class="map-count">{{ $filters.translate('TL_MAP_AREAS_COUNT', { n: mapAreas.length }) }}</span>
      <image-map-dialog v-model="mapping" :title="$filters.translate(schema.label)" :src="imageUrl()" :schema="schema" :image-map="attachment.imageMap" @apply="onMapApply" />
    </template>
    <v-btn v-if="!isImage(attachment) && attachment._id" :theme="theme" size="small" rounded elevation="0" @click="viewFile()">{{ $filters.translate('TL_VIEW') }}</v-btn>
    <div v-if="isImage(attachment) && loadingError" class="loading-error">{{ $filters.translate('TL_LOADING_ERROR') }}</div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import CropDialog from '@c/attachments/CropDialog.vue'
  import ImageMapDialog from '@c/attachments/ImageMapDialog.vue'
  import ImageMapOverlay from '@c/attachments/ImageMapOverlay.vue'
  import RequestService from '@s/RequestService'
  import { dataUrlToBlob } from '@u/cropPreview'
  import { canCrop, hasCrop, isCroppable, readRecipe, resultSize } from '@u/cropRecipe'

  // the tallest a picture with a crop is shown (a tall crop is narrower than the card, so that it is whole and not higher)
  const PREVIEW_HEIGHT = 220

  export default {
    components: { CropDialog, ImageMapDialog, ImageMapOverlay },
    props: {
      theme: { type: String, default: 'light' },
      attachment: { type: Object, default: () => ({}) },
      getImageSrc: { type: Function, default: () => {} },
      imageSize: { type: Function, default: () => {} },
      schema: { type: Object, default: () => ({}) },
      removeImage: { type: Function, default: () => {} },
      isImage: { type: Function, default: () => {} },
      // (cropOptions, preview) => the crop made in the tool, to keep with the picture
      onCrop: { type: Function, default: () => {} },
      // (imageMap) => the map made in the tool, to keep with the picture
      onMap: { type: Function, default: () => {} }
    },
    data() {
      return {
        PREVIEW_HEIGHT,
        cropping: false,
        mapping: false,
        // the shape of the picture as the browser shows it, measured once it is loaded (the overlay of a map has to fit it)
        probedAspect: null,
        loadingError: false
      }
    },
    computed: {
      /** @returns {boolean} whether the field is an image map */
      mapEnabled () {
        return _.get(this.schema, 'input') === 'imagemap'
      },
      /** @returns {Array<Object>} the areas of the map kept with the picture */
      mapAreas () {
        return _.get(this.attachment, 'imageMap.areas', [])
      },
      /** @returns {number|null} the picture's width over its height: as the browser shows it, else as the server measured it; a map is drawn over the whole picture */
      mapAspect () {
        if (!this.mapEnabled) {
          return null
        }
        const meta = this.attachment._meta
        return this.probedAspect || (meta && meta.width && meta.height ? meta.width / meta.height : null)
      },
      /** @returns {number|null} the shape the preview takes: that of the crop, or of the picture for a map; null keeps the card's own shape */
      previewAspect () {
        return this.cropShape.aspect || this.mapAspect
      },
      /** @returns {boolean} whether the field has the crop tool and the picture can be cut */
      cropEnabled () {
        return canCrop(this.schema) && isCroppable(this.attachment)
      },
      /** @returns {{aspect: number|null, round: boolean}} the shape the crop gives the picture: the preview has it, round for a circle (no aspect: the card's own shape) */
      cropShape() {
        const none = { aspect: null, round: false }
        if (!this.cropEnabled || !hasCrop(this.attachment.cropOptions)) {
          return none
        }
        const state = readRecipe(this.attachment.cropOptions)
        const size = state.rect ? resultSize(state.rect, state.output) : null
        return { aspect: size ? size.width / size.height : null, round: state.shape === 'circle' }
      },
      /** @returns {boolean} whether the picture opens with a click: it is saved, or it has a crop that was made and not saved yet (the small picture of it opens) */
      viewable() {
        return !!this.attachment._id || this.hasPendingCrop
      },
      /** @returns {boolean} whether the crop tool made a crop of this picture that is not saved yet, with the small picture of it */
      hasPendingCrop() {
        return this.cropEnabled && !!this.attachment.cropPreview && !!_.get(this.attachment, 'cropOptions.updated') && hasCrop(this.attachment.cropOptions)
      },
      /** @returns {boolean} whether the server can be asked where to crop: the picture is stored, or is a file the browser can send */
      canSuggest () {
        return !!(this.attachment._id && this.attachment.url) || this.attachment.file instanceof Blob
      }
    },
    watch: {
      // the picture of a map is measured again when it is another one
      'attachment.url'() {
        this.probe()
      },
      'attachment.data'() {
        this.probe()
      }
    },
    mounted() {
      this.probe()
    },
    methods: {
      /** Measures the picture of a map (its shape is the shape of the preview, so that the areas are over the right parts of it). */
      probe() {
        const src = this.imageUrl()
        if (!this.mapEnabled || !src || typeof Image === 'undefined') {
          return
        }
        const image = new Image()
        image.onload = () => {
          if (image.naturalWidth && image.naturalHeight) {
            this.probedAspect = image.naturalWidth / image.naturalHeight
          }
        }
        image.src = src
      },
      /** @param {boolean} val */
      setLoadingError(val) {
        this.loadingError = val
      },
      /** Opens the attachment in a new tab, its extension added to the url so the browser knows the type (the cut of a picture that has a crop). */
      viewFile() {
        if (!this.attachment) { return }
        // a picture with a crop shows its cut: the small picture while the crop is not saved, the cut the API makes after
        if (this.hasPendingCrop) {
          const address = URL.createObjectURL(dataUrlToBlob(this.attachment.cropPreview))
          const tab = window.open(address, '_blank')
          if (tab) { tab.focus() }
          setTimeout(() => URL.revokeObjectURL(address), 60000)
          return
        }
        if (!this.attachment._id) { return }
        if (this.cropEnabled && hasCrop(this.attachment.cropOptions) && this.attachment.url) {
          const tab = window.open(`${window.origin}${this.attachment.url}/cropped`, '_blank')
          if (tab) { tab.focus() }
          return
        }
        const filenameComponents = _.get(this.attachment, '_filename', '').split('.')
        const suffix = filenameComponents.length > 1 ? `.${_.last(filenameComponents)}` : ''
        const win = window.open(window.origin + _.get(this.attachment, 'url', '') + suffix, '_blank')
        if (win) { win.focus() }
      },
      /** @returns {string} the url of the attachment, or its data url before it is uploaded */
      imageUrl() {
        return _.get(this.attachment, 'url', _.get(this.attachment, 'data', ''))
      },
      /**
       * Asks the server where smart cropping would put the crop.
       * @param {number} aspect width over height
       * @param {{rotate: number, flipX: boolean, flipY: boolean}} turn how the picture is turned in the tool
       * @returns {Promise<{left: number, top: number, width: number, height: number}>} in pixels of the picture so turned
       */
      suggest(aspect, turn) {
        const query = new URLSearchParams({ aspect: String(aspect), rotate: String(turn.rotate || 0), flipX: String(!!turn.flipX), flipY: String(!!turn.flipY) })
        if (this.attachment._id && this.attachment.url) {
          return RequestService.get(`${this.attachment.url}/crop-suggestion?${query}`)
        }
        // not stored yet: the picture goes with the question
        const body = new FormData()
        body.append('image', this.attachment.file)
        return RequestService.post(`../api/${_.get(this.schema, 'resource.title')}/attachments/crop-suggestion?${query}`, body)
      },
      /**
       * @param {Object} cropOptions the recipe
       * @param {string} preview a small picture of the result
       */
      onApply(cropOptions, preview) {
        this.onCrop(cropOptions, preview)
      },
      /** @param {{areas: Array<Object>, updated: boolean}} imageMap the map made in the tool */
      onMapApply(imageMap) {
        this.onMap(imageMap)
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

.edit-crop,
.edit-map {
  margin-top: 8px;
}
.map-count {
  margin-left: 8px;
  font-size: 12px;
  color: var(--cms-text-muted);
}
.loading-error {
  color: red;
  font-size: vw(16px);
}
</style>
