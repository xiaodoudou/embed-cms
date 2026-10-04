<template>
  <v-card v-if="attachment" :key="getKey(attachment)" :theme="theme" elevation="0" class="preview-attachment" :class="{odd: index % 2 !== 0, 'can-crop': schema.crop}">
    <!-- the only place that starts a drag (shown when there is something to put in order); the compact mode swaps it for the buttons that move the file one place -->
    <span v-if="reordering && !locked" class="move-buttons">
      <v-btn class="move-earlier" :disabled="index === 0" variant="tonal" icon rounded size="x-small" :aria-label="`${$filters.translate('TL_MOVE_EARLIER')}: ${getAttachmentFilename(attachment)}`" @click="moveAttachment(index, -1)"><v-icon icon="$arrowLeft" /></v-btn>
      <v-btn class="move-later" :disabled="index === count - 1" variant="tonal" icon rounded size="x-small" :aria-label="`${$filters.translate('TL_MOVE_LATER')}: ${getAttachmentFilename(attachment)}`" @click="moveAttachment(index, 1)"><v-icon icon="$arrowRight" /></v-btn>
    </span>
    <!-- the grip and the name of the file side by side: the grip is not laid over the name -->
    <div class="preview-head">
      <span v-if="!locked && !reordering && count > 1" class="drag-grip" :title="$filters.translate('TL_DRAG_TO_REORDER')"><v-icon icon="$dragVertical" size="small" /></span>
      <v-tooltip :theme="theme" location="right" eager>
        <template #activator="{ props }">
          <v-chip variant="outlined" class="filename" :class="{'is-dirty': attachment.dirty}" :closable="!locked" close-icon="$closeCircleOutline" :close-label="$filters.translate('TL_REMOVE')" v-bind="props" @click:close="removeImage(attachment, index)" @contextmenu.stop.prevent="copyFilenameToClipboard()">#{{ index + 1 }} - {{ $filters.truncate(getAttachmentFilename(attachment),10) }} ({{ imageSize(attachment) }})</v-chip>
        </template>
        <span>{{ attachment._filename }} <template v-if="attachment.dirty">({{ $filters.translate(getDirtyReason()) }})</template></span>
      </v-tooltip>
    </div>
    <show-attachment
      class-name="row-handle"
      :theme="theme" :attachment="attachment" :image-size="imageSize" :get-image-src="getImageSrc"
      :remove-image="removeImage" :is-image="isImage" :schema="schema" :on-cropper-change="onCropperChangeForAttachment"
    />
  </v-card>
</template>

<script>
  import _ from 'lodash'
  import ShowAttachment from '@c/attachments/ShowAttachment.vue'
  import Notification from '@m/Notification'

  export default {
    components: {ShowAttachment},
    mixins: [Notification],
    props: {
      index: { type: Number, default: 0 },
      theme: { type: String, default: 'light' },
      attachment: { type: Object, default: () => ({}) },
      schema: { type: Object, default: () => ({}) },
      getImageSrc: { type: Function, default: () => {} },
      imageSize: { type: Function, default: () => {} },
      // a disabled or read-only field keeps its attachments but cannot remove them
      locked: { type: Boolean, default: false },
      removeImage: { type: Function, default: () => {} },
      // the compact mode: the buttons that move the file one place, and how many files there are (the last one cannot go later)
      reordering: { type: Boolean, default: false },
      count: { type: Number, default: 0 },
      moveAttachment: { type: Function, default: () => {} },
      isImage: { type: Function, default: () => {} },
      onCropperChange: { type: Function, default: () => {} }
    },
    methods: {
      /** @returns {string} the translation key of the dirty reason of the attachment, TL_DIRTY without a specific one */
      getDirtyReason() {
        const key = _.get(this.attachment, 'dirty', false) ? `${_.replace(_.toUpper(this.attachment.dirty), /-/g, '_')}` : 'DIRTY'
        return `TL_${key}`
      },
      copyFilenameToClipboard() {
        navigator.clipboard.writeText(this.getAttachmentFilename(this.attachment))
        this.notify('Filename has been copied.')
      },
      /**
       * @param {Object} attachment
       * @returns {string} _filename, else _fields._filename
       */
      getAttachmentFilename(attachment) {
        return _.get(attachment, '_filename', _.get(attachment, '_fields._filename', ''))
      },
      /**
       * @param {Object} elem an attachment
       * @returns {string} a key for v-for: the filename and the id (else the creation date, else the index)
       */
      getKey(elem) {
        return `${_.get(elem, '_filename', '')}-${_.get(elem, '_id', _.get(elem, '_createdAt', this.index))}`
      },
      /** @param {{coordinates: Object}} data from the cropper; only the coordinates go up */
      onCropperChangeForAttachment(data) {
        this.onCropperChange(this.index, _.pick(data, ['coordinates']))
      }
    }
  }
</script>

<style lang="scss">
.field-wrapper{
  .v-card .v-chip {
    &:hover {
      background: var(--cms-overlay-hover);
      cursor: copy;
    }
  }
}
</style>
