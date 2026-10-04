<template>
  <v-card v-if="attachment" :key="getKey(attachment)" :theme="theme" elevation="0" class="preview-attachment" :class="{odd: index % 2 !== 0}">
    <!-- the top row is for putting the files in order: with one file there is nothing to put in order, and no row -->
    <div v-if="count > 1" class="preview-top">
      <!-- the only place that starts a drag (shown when there is something to put in order); the compact mode swaps it for the buttons that move the file one place -->
      <span v-if="!locked && !reordering && count > 1" class="drag-grip" :title="$filters.translate('TL_DRAG_TO_REORDER')"><v-icon icon="$dragVertical" size="small" /></span>
      <span v-if="reordering && !locked" class="move-buttons">
        <v-btn class="move-earlier" :disabled="index === 0" variant="tonal" icon rounded size="x-small" :aria-label="`${$filters.translate('TL_MOVE_EARLIER')}: ${getAttachmentFilename(attachment)}`" @click="moveAttachment(index, -1)"><v-icon icon="$arrowLeft" /></v-btn>
        <v-btn class="move-later" :disabled="index === count - 1" variant="tonal" icon rounded size="x-small" :aria-label="`${$filters.translate('TL_MOVE_LATER')}: ${getAttachmentFilename(attachment)}`" @click="moveAttachment(index, 1)"><v-icon icon="$arrowRight" /></v-btn>
      </span>
      <span class="preview-position">{{ index + 1 }}/{{ count }}</span>
    </div>
    <div class="preview-picture" :class="{'is-file': !isImage(attachment)}">
      <show-attachment
        class-name="row-handle"
        :theme="theme" :attachment="attachment" :image-size="imageSize" :get-image-src="getImageSrc"
        :remove-image="removeImage" :is-image="isImage" :schema="schema" :on-crop="onCropAt" :on-map="onMapAt"
      />
      <!-- on a picture: a bin in its corner, so that a file alone (no grip, no position) has no empty row above it -->
      <v-btn v-if="!locked && isImage(attachment)" class="preview-remove" variant="text" icon size="x-small" :aria-label="$filters.translate('TL_REMOVE')" :title="$filters.translate('TL_REMOVE')" @click="removeImage(attachment, index)">
        <v-icon icon="$trashCanOutline" size="16" />
      </v-btn>
      <!-- no picture to lay it on (a file with its View button): a button with its word, beside View -->
      <v-btn v-else-if="!locked" class="preview-remove is-text" variant="outlined" size="small" rounded elevation="0" @click="removeImage(attachment, index)">
        {{ $filters.translate('TL_REMOVE') }}
      </v-btn>
    </div>
    <v-tooltip :theme="theme" location="top" eager>
      <template #activator="{ props }">
        <div class="filename" :class="{'is-dirty': attachment.dirty}" v-bind="props" @contextmenu.stop.prevent="copyFilenameToClipboard()">
          <span class="filename-text">{{ getAttachmentFilename(attachment) }}</span>
          <span class="filename-size">{{ imageSize(attachment) }}</span>
        </div>
      </template>
      <span>{{ attachment._filename }} <template v-if="attachment.dirty">({{ $filters.translate(getDirtyReason()) }})</template></span>
    </v-tooltip>
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
      onCrop: { type: Function, default: () => {} },
      onMap: { type: Function, default: () => {} }
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
      /**
       * @param {Object} cropOptions the crop made in the tool
       * @param {string} preview a small picture of the result
       */
      onCropAt(cropOptions, preview) {
        this.onCrop(this.index, cropOptions, preview)
      },
      /** @param {Object} imageMap the map made in the tool */
      onMapAt(imageMap) {
        this.onMap(this.index, imageMap)
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
