<template>
  <div class="attachment-view">
    <form enctype="multipart/form-data">
      <field-label :schema="schema" :disabled="disabled" :input-id="isFieldDisabled() ? '' : inputId" />
      <v-card
        v-if="!isFieldDisabled()"
        :theme="theme"
        class="file-input-card" elevation="0"
        @drop.prevent="onDrop($event)" @dragover.prevent @dragenter.prevent
      >
        <v-file-input
          :id="inputId" ref="input" v-model="boxFiles"
          :name="schema.model" :theme="theme" flat :rules="getRules()" prepend-icon="" prepend-inner-icon="$upload" :placeholder="getPlaceholder()" :clearable="false" hide-details="auto"
          density="compact" :variant="getVariant()" rounded persistent-placeholder single-line :multiple="isForMultipleImages()" :accept="schema.accept"
          @change="onUploadChanged" @update:focused="onFieldFocus"
        >
          <template #selection />
        </v-file-input>
      </v-card>
    </form>
    <preview-multiple
      :attachments="getAttachments()" :move-attachment="moveAttachment" :schema="schema" :theme="theme" :is-image="isImage" :disabled="isLocked()" :on-end-drag="onEndDrag" :image-size="imageSize" :get-image-src="getImageSrc"
      :remove-image="removeImage"
    />
    <file-input-errors file-type="file" :schema="schema" :is-for-multiple-images="isForMultipleImages" :get-max-count="getMaxCount" />
  </div>
</template>

<script>
  import AbstractField from '@m/AbstractField'
  import FileInputField from '@m/FileInputField'
  import PreviewMultiple from '@c/attachments/PreviewMultiple.vue'
  import FileInputErrors from '@c/attachments/FileInputErrors.vue'

  export default {
    components: {PreviewMultiple, FileInputErrors},
    mixins: [AbstractField, FileInputField]
  }
</script>
