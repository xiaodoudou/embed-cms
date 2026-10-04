<template>
  <div class="image-view" :class="{'full-width': !(schema.width && schema.height)}">
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
          :name="schema.model"
          :theme="theme" variant="solo-filled" :rules="getRules()" hide-details="auto" prepend-icon="" prepend-inner-icon="$upload" flat
          single-line :placeholder="getPlaceholder()" :clearable="false"
          density="compact" rounded persistent-placeholder :multiple="isForMultipleImages()" :accept="schema.accept"
          @change="onUploadChanged" @update:focused="onFieldFocus"
        >
          <template #selection />
        </v-file-input>
      </v-card>
    </form>
    <preview-multiple
      :attachments="getAttachments()" :move-attachment="moveAttachment" :schema="schema" :theme="theme" :is-image="isImage" :disabled="isLocked()" :on-end-drag="onEndDrag" :image-size="imageSize" :get-image-src="getImageSrc"
      :remove-image="removeImage" :on-crop="onCrop" :on-map="onMap"
    />
    <file-input-errors file-type="image" :schema="schema" :is-for-multiple-images="isForMultipleImages" :get-max-count="getMaxCount" />
  </div>
</template>

<script>
  import AbstractField from '@m/AbstractField'
  import FileInputField from '@m/FileInputField'
  import PreviewMultiple from '@c/attachments/PreviewMultiple.vue'
  import FileInputErrors from '@c/attachments/FileInputErrors.vue'

  export default {
    components: {PreviewMultiple, FileInputErrors},
    mixins: [AbstractField, FileInputField],
    methods: {
      // a file of an image field that says nothing about its type (no extension, no stored type) is shown as an image
      unknownIsImage () {
        return true
      }
    }
  }
</script>

<style lang="scss">
@use '@a/scss/variables.scss' as *;

.image-view {

  .field-label {
    padding-left: 8px;
  }
}
</style>
