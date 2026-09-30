<template>
  <div class="attachment-view">
    <form enctype="multipart/form-data">
      <field-label :schema="schema" />
      <v-card
        v-if="!isFieldDisabled()"
        :theme="theme"
        class="file-input-card" elevation="0" :class="{ 'drag-and-drop': dragover }"
        @drop.prevent="onDrop($event)" @dragover.prevent="dragover = true" @dragenter.prevent="dragover = true" @dragleave.prevent="dragover = false"
      >
        <v-file-input
          ref="input"
          :theme="theme" flat :rules="getRules()" prepend-icon="" prepend-inner-icon="$upload" :label="getPlaceholder()" :placeholder="getPlaceholder()" :clearable="false" hide-details="auto"
          density="compact" :variant="getVariant()" rounded persistent-placeholder single-line :multiple="isForMultipleImages()" :accept="schema.accept"
          @change="onUploadChanged" @update:focused="onFieldFocus"
        >
          <template #selection />
        </v-file-input>
      </v-card>
    </form>
    <preview-multiple
      :attachments="getAttachments()" :schema="schema" :theme="theme" :is-image="isImage" :disabled="isLocked()" :on-end-drag="onEndDrag" :image-size="imageSize" :get-image-src="getImageSrc"
      :remove-image="removeImage"
    />
    <file-input-errors v-if="!disabled" file-type="file" :schema="schema" :is-for-multiple-images="isForMultipleImages" :get-max-count="getMaxCount" />
  </div>
</template>

<script>
  import AbstractField from '@m/AbstractField'
  import FileInputField from '@m/FileInputField'
  import PreviewMultiple from '@c/PreviewMultiple'
  import FileInputErrors from '@c/FileInputErrors'

  export default {
    components: {PreviewMultiple, FileInputErrors},
    mixins: [AbstractField, FileInputField]
  }
</script>
