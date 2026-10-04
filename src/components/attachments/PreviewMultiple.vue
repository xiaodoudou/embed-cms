<template>
  <div class="preview-multiple">
    <div v-if="attachments.length > 1 && !disabled" class="reorder-bar">
      <v-btn class="reorder-toggle" variant="text" size="small" :aria-pressed="reordering ? 'true' : 'false'" @click="reordering = !reordering">
        <v-icon start icon="$swapVertical" />{{ $filters.translate(reordering ? 'TL_DONE_REORDERING' : 'TL_REORDER') }}
      </v-btn>
    </div>
    <draggable
      :key="`${schema.model}-${key}`"
      :list="attachments" :group="`${schema.model}-${key}`" :item-key="getKey"
      draggable=".preview-attachment" handle=".drag-grip" ghost-class="ghost"
      v-bind="dragOptions" :class="{disabled}" class="preview-multiple" @choose="onDragChoose" @unchoose="onDragUnchoose" @start="onDragStart" @end="onEndDrag"
    >
      <preview-attachment
        v-for="(a, i) in attachments"
        :key="identityOf(a)" :schema="schema"
        :theme="theme" :attachment="a" :image-size="imageSize" :get-image-src="getImageSrc"
        :locked="disabled" :reordering="reordering" :count="attachments.length" :move-attachment="moveAttachment" :remove-image="removeImage" :is-image="isImage" :index="i" :on-crop="onCrop" :on-map="onMap"
      />
    </draggable>
  </div>
</template>

<script>
  import PreviewAttachment from '@c/attachments/PreviewAttachment.vue'
  import DragList from '@m/DragList'

  // A key for each attachment, for as long as it is the same object: after a reorder the preview moves with its file. Keyed by position,
  // each preview would keep its place and be given another file, whose picture it loads again (the images blink at every move).
  const identities = new WeakMap()
  let sequence = 0

  export default {
    components: {PreviewAttachment},
    mixins: [DragList],
    props: {
      attachments: { type: Array, default: () => [] },
      schema: { type: Object, default: () => {} },
      theme: { type: String, default: 'light' },
      isImage: { type: Function, default: () => {} },
      getImageSrc: { type: Function, default: () => {} },
      disabled: { type: Boolean, default: false },
      onEndDrag: { type: Function, default: () => {} },
      // moves the file at an index one place (FileInputField)
      moveAttachment: { type: Function, default: () => {} },
      imageSize: { type: Function, default: () => {} },
      removeImage: { type: Function, default: () => {} },
      onCrop: { type: Function, default: () => {} },
      onMap: { type: Function, default: () => {} }
    },
    data () {
      return { reordering: false }
    },
    methods: {
      /**
       * @param {Object} attachment
       * @returns {number} a number that stays with this attachment, wherever it is in the list
       */
      identityOf (attachment) {
        if (!identities.has(attachment)) {
          identities.set(attachment, ++sequence)
        }
        return identities.get(attachment)
      }
    },
  }
</script>
