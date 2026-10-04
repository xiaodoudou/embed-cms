<template>
  <div class="row-handle">
    <div v-if="isImage(attachment)" class="image-wrapper">
      <v-img v-if="attachment._id" cover :aspect-ratio="16 / 10" :src="getImageSrc(attachment)" class="clickable" @click="viewFile()" @load="setLoadingError(false)" @error="setLoadingError(true)" />
      <v-img v-else cover :aspect-ratio="16 / 10" :src="getImageSrc(attachment)" @load="setLoadingError(false)" @error="setLoadingError(true)" />
      <!-- Cropped image -->
      <v-dialog v-if="attachment && schema.crop" class="crop-dialog">
        <template #activator="{ props: activatorProps }">
          <v-btn class="edit-crop" v-bind="activatorProps" variant="outlined" rounded size="small">
            <v-icon icon="$crop" />{{ $filters.translate('TL_EDIT_CROP') }}
          </v-btn>
        </template>
        <template #default="{ isActive }">
          <v-card :title="$filters.translate(schema.label)">
            <div class="parent-parent">
              <div class="cropper-parent">
                {{ !schema.crop.width || !schema.crop.height ? 'stencil' : 'fit-area' }}
                <cropper
                  ref="cropper"
                  :src="imageUrl()" :transitions="true"
                  :image-restriction="!schema.crop.width || !schema.crop.height ? 'stencil' : 'fit-area'" default-boundaries="fill" class="cropper"
                  :default-size="getDefaultCropSize()" :default-position="getDefaultCropPosition"
                  :move-image="hasOpt('moveImage')" :resize-image="hasOpt('resizeImage')"
                  :stencil-props="stencilProps"
                  v-bind="{
                    ...(schema.crop.width ? {
                      'min-width': getCurrentWidth(),
                      'max-width': getCurrentWidth()
                    } : {}),
                    ...(schema.crop.height ? {
                      'min-height': getCurrentHeight(),
                      'max-height': getCurrentHeight()
                    } : {})
                  }"
                  @change="onCropperChangeForAttachment"
                />
              </div>
            </div>
            <v-card-actions>
              <!-- Crop size controls when dimensions aren't fixed -->
              <div v-if="!schema.crop.width || !schema.crop.height" class="crop-size-controls">
                <v-text-field
                  v-if="!schema.crop.width"
                  v-model.number="customWidth"
                  type="number"
                  :label="$filters.translate('TL_WIDTH')"
                  density="compact"
                  variant="outlined"
                  hide-details
                  min="1"
                  @update:model-value="updateCropSize"
                />
                <v-text-field
                  v-if="!schema.crop.height"
                  v-model.number="customHeight"
                  type="number"
                  :label="$filters.translate('TL_HEIGHT')"
                  density="compact"
                  variant="outlined"
                  hide-details
                  min="1"
                  @update:model-value="updateCropSize"
                />
              </div>

              <!-- Action buttons -->
              <v-spacer />
              <v-btn variant="outlined" rounded @click="isActive.value = false">
                {{ $filters.translate('TL_CLOSE') }}
              </v-btn>
              <v-btn variant="outlined" rounded class="apply" @click="apply(isActive)">
                {{ $filters.translate('TL_APPLY_CROP') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </template>
      </v-dialog>
    </div>
    <v-btn v-else-if="attachment._id" :theme="theme" size="small" rounded elevation="0" @click="viewFile()">{{ $filters.translate('TL_VIEW') }}</v-btn>
    <div v-if="isImage(attachment) && loadingError" class="loading-error">{{ $filters.translate('TL_LOADING_ERROR') }}</div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import { Cropper } from 'vue-advanced-cropper'
  import 'vue-advanced-cropper/dist/style.css'

  export default {
    components: { Cropper },
    props: {
      theme: { type: String, default: 'light' },
      attachment: { type: Object, default: () => ({}) },
      getImageSrc: { type: Function, default: () => {} },
      imageSize: { type: Function, default: () => {} },
      schema: { type: Object, default: () => ({}) },
      removeImage: { type: Function, default: () => {} },
      isImage: { type: Function, default: () => {} },
      onCropperChange: { type: Function, default: () => {} }
    },
    data() {
      return {
        cropData: false,
        firstCropUpdate: true,
        customWidth: null,
        customHeight: null,
        loadingError: false,
        stencilProps: {
          class: 'cropper-stencil',
          previewClass: 'cropper-stencil__preview',
          draggingClass: 'cropper-stencil--dragging',
          handlersClasses: {
            default: 'cropper-handler',
            eastNorth: 'cropper-handler--east-north',
            westNorth: 'cropper-handler--west-north',
            eastSouth: 'cropper-handler--east-south',
            westSouth: 'cropper-handler--west-south'
          }
        }
      }
    },
    mounted() {
      this.customWidth = _.get(this.schema, 'crop.width', 500)
      this.customHeight = _.get(this.schema, 'crop.height', 500)
    },
    methods: {
      /** @param {boolean} val */
      setLoadingError(val) {
        this.loadingError = val
      },
      /** Opens the attachment in a new tab, its extension added to the url so the browser knows the type. */
      viewFile() {
        if (!this.attachment) { return }
        const filenameComponents = _.get(this.attachment, '_filename', '').split('.')
        const suffix = filenameComponents.length > 1 ? `.${_.last(filenameComponents)}` : ''
        const win = window.open(window.origin + _.get(this.attachment, 'url', '') + suffix, '_blank')
        if (win) { win.focus() }
      },
      /**
       * @param {string} key a crop option
       * @returns {*} its value, false when unset
       */
      hasOpt(key) {
        return _.get(this.schema, `crop.${key}`, false)
      },
      /** @returns {string} the url of the attachment, or its data url before it is uploaded */
      imageUrl() {
        return _.get(this.attachment, 'url', _.get(this.attachment, 'data', ''))
      },
      /**
       * @param {{imageSize: Object, visibleArea: Object, coordinates: Object}} cropper
       * @returns {{left: number, top: number}} the saved crop position of the attachment, else the crop centred in the visible area
       */
      getDefaultCropPosition({ imageSize, visibleArea, coordinates }) {
        if (_.get(this.attachment, 'cropOptions', false)) {
          return {
            left: _.get(this.attachment, 'cropOptions.left', 0),
            top: _.get(this.attachment, 'cropOptions.top', 0)
          }
        }
        const area = visibleArea || imageSize
        return {
          left: (visibleArea ? visibleArea.left : 0) + area.width / 2 - coordinates.width / 2,
          top: (visibleArea ? visibleArea.top : 0) + area.height / 2 - coordinates.height / 2
        }
      },
      /** @returns {{width: number, height: number}} */
      getDefaultCropSize() {
        return {
          width: this.getCurrentWidth(),
          height: this.getCurrentHeight()
        }
      },
      /** @returns {number} the crop width of the schema, else the custom one, else 500 */
      getCurrentWidth() {
        return _.get(this.schema, 'crop.width', this.customWidth || 500)
      },
      /** @returns {number} the crop height of the schema, else the custom one, else 500 */
      getCurrentHeight() {
        return _.get(this.schema, 'crop.height', this.customHeight || 500)
      },
      /** Refreshes the cropper on the next tick. */
      updateCropSize() {
        this.$nextTick(() => {
          if (this.$refs.cropper) {
            this.$refs.cropper.refresh()
          }
        })
      },
      /** @param {Object} data the crop, kept until apply; the first change is the cropper settling and is ignored */
      onCropperChangeForAttachment(data) {
        this.cropData = data
        if (this.firstCropUpdate) {
          this.firstCropUpdate = false
          return
        }
        if (data && data.coordinates) {
          if (!_.get(this.schema, 'crop.width', false)) {
            this.customWidth = Math.round(data.coordinates.width)
          }
          if (!_.get(this.schema, 'crop.height', false)) {
            this.customHeight = Math.round(data.coordinates.height)
          }
        }
      },
      /** @param {{value: boolean}} isActive the active ref of the dialog, closed */
      apply(isActive) {
        isActive.value = false
        this.onCropperChange(this.cropData)
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;

.edit-crop {
  margin-top: 8px;
}
.crop-dialog {
  .v-card {
    max-width: 100%;
    max-height: 90vh;
    overflow: hidden;
  }
  .parent-parent {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow: hidden;
    height: 70vh;
  }
  .cropper {
    max-width: 100%;
    max-height: 70vh;
  }
  .v-card-actions {
    display: flex;
    align-items: center;
    gap: 16px;

    .crop-size-controls {
      display: flex;
      gap: 12px;
      align-items: center;

      .v-text-field {
        width: 100px;
        flex-shrink: 0;
      }
    }

    .v-btn {
      @include cta-text;
      &.apply {
        color: $btn-action-color;
        background-color: $btn-action-background;
      }
    }
  }
}
.loading-error {
  color: red;
  font-size: vw(16px);
}
</style>
