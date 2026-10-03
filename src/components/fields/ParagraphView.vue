<template>
  <div class="paragraph-field">
    <!-- the label sits above the box, like the label of every other field -->
    <field-label class="paragraph-label" :schema="schema" />
    <div v-if="schema.options && schema.options.hint" class="help-block paragraph-hint">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
    <div class="paragraph-view" :class="{'can-add-more': !blockMoreItems()}" :style="{ '--paragraph-level': getParagraphLevel() }">
      <div v-if="!blockMoreItems()" class="paragraph-header-bar">
        <v-autocomplete
          ref="input" :ripple="false" :menu-props="menuProps" :theme="theme" transition="none" :model-value="selectedType" :items="types" :item-title="getLabel" item-value="title" hide-details
          rounded density="compact" persistent-placeholder variant="solo-filled" flat :rules="[validateField]" :disabled="disabled || schema.disabled" menu-icon="$chevronDown" @update:model-value="onChangeType"
        >
          <template #label />
        </v-autocomplete>
        <div class="add-btn-wrapper">
          <v-btn elevation="0" class="add-new-item" :disabled="blockMoreItems()" @click="onClickAddNewItem"><span>{{ $filters.translate('TL_ADD') }}</span></v-btn>
          <v-btn v-if="hasFileOrImageTypes" elevation="0" class="add-multiple-items" variant="outlined" :disabled="blockMoreItems()" @click="toggleMultipleDropZone">
            <span>{{ $filters.translate('TL_ADD_MULTIPLE') }}</span>
          </v-btn>
        </div>
      </div>
      <div v-if="showMultipleDropZone" class="multiple-drop-zone" :class="{ 'drag-over': isDragOver }" @click="$refs.fileInput.click()" @drop="onDropFiles" @dragover.prevent="onDragOver" @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave">
        <div class="drop-zone-content">
          <v-icon size="48" icon="$cloudUpload" />
          <div class="drop-zone-text">
            <div class="primary-text">{{ $filters.translate('TL_DRAG_AND_DROP_FILES_HERE') }}</div>
            <div class="secondary-text">{{ $filters.translate('TL_OR_CLICK_TO_SELECT_FILES') }}</div>
            <div class="supported-types">
              {{ $filters.translate('TL_SUPPORTED_TYPES') }}: {{ getSupportedExtensions() }}
            </div>
            <div v-if="getDefaultParagraph()" class="default">{{ $filters.translate('TL_DRAG_AND_DROP_DEFAULT') }}: {{ getDefaultParagraph() }}</div>
          </div>
          <input ref="fileInput" type="file" multiple style="display: none" :accept="getAllAcceptedTypes()" @change="onSelectFiles">
        </div>
      </div>
      <div class="paragraph-content">
        <draggable
          v-if="schema && subResourcesLoaded" :key="`${schema.model}-${key}`" :list="items" :class="{disabled, 'dynamic-layout-container': isDynamicLayoutContainer}" draggable=".item" v-bind="dragOptions" handle=".handle" :group="`${schema.model}-${key}`" ghost-class="ghost" :force-fallback="true"
          @end="onEndDrag"
        >
          <v-card v-for="(item, idx) in items" :key="`paragraph-item-${idx}`" :theme="theme" elevation="0" :class="getItemClasses(idx, item)" :style="getItemStyles(item)">
            <v-card-title class="handle paragraph-header">
              <div class="paragraph-title">{{ getLabel(item) }}</div>
              <div class="add-btn-wrapper">
                <v-btn class="remove-item" :disabled="disabled || schema.disabled" variant="text" icon rounded size="small" @click="onClickRemoveItem(item)">
                  <v-icon icon="$trashCanOutline" />
                </v-btn>
              </div>
            </v-card-title>
            <div class="item-main-wrapper">
              <div class="item-main">
                <div v-if="item.showConvert || item.cannotConvert" class="convert-paragraph">
                  <div v-if="item.cannotConvert" class="error-message">{{ $filters.translate('TL_INVALID_PARAGRAPH_CANNOT_BE_CONVERTED') }}</div>
                  <div v-else class="error-message">{{ $filters.translate('TL_INVALID_PARAGRAPH_WOULD_YOU_LIKE_TO_CONVERT_IT') }}</div>
                  <json-viewer :value="item" tabindex="-1" />
                  <template v-if="item.showConvert">
                    <div class="convert-action">
                      <v-select
                        :model-value="item.showConvert" :menu-props="menuProps" :theme="theme" transition="none" :items="types" hide-details rounded density="compact" persistent-placeholder variant="solo-filled"
                        flat
                      >
                        <template #prepend><field-label :schema="{label: $filters.translate('TL_CONVERT_TO')}" /></template>
                        <template #label />
                      </v-select>
                      <v-btn elevation="0" rounded @click="convertParagraph(item)">{{ $filters.translate('TL_CONVERT') }}</v-btn>
                    </div>
                  </template>
                </div>
                <custom-form v-else :schema="getSchema(item, idx)" :model="item" :paragraph-index="idx" :paragraph-level="blockMoreItems() ? paragraphLevel : paragraphLevel + 1" @error="onError" @input="onModelUpdated" />
              </div>
            </div>
          </v-card>
        </draggable>
      </div>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import SchemaService from '@s/SchemaService'
  import FieldSelectorService from '@s/FieldSelectorService'
  import ResourceService from '@s/ResourceService'
  import TranslateService from '@s/TranslateService'
  import DragList from '@m/DragList'
  import pAll from 'p-all'
  import { queueFiles, takeFiles } from '@u/pendingFiles'

  export default {
    mixins: [DragList],
    props: {
      schema: { type: Object, default: () => ({}) },
      vfg: { type: Object, default: () => ({}) },
      model: { type: Object, default: () => ({}) },
      disabled: { type: Boolean, default: false },
      paragraphLevel: { type: Number, default: 0 },
      theme: { type: String, default: 'default' }
    },
    emits: ['input', 'notify'],
    data () {
      return {
        items: _.cloneDeep(_.get(this.model, this.schema.model, [])),
        types: [],
        fileInputTypes: ['file', 'img', 'image', 'imageView', 'attachmentView'],
        selectedType: false,
        subResourcesLoaded: false,
        key: crypto.randomUUID(),
        maxCount: _.get(this.schema, 'options.maxCount', -1),
        menuProps: {
          contentProps: {
            density: 'compact'
          }
        },
        highlight: {
          level: -1,
          index: -1
        },
        showMultipleDropZone: false,
        isDragOver: false
      }
    },
    computed: {
      isDynamicLayoutContainer() {
        return this.schema && (
          _.get(this.schema, 'options.dynamicLayout', false) ||
          _.some(this.items, item => _.has(item, '_value.slots') || _.has(item, 'slots'))
        )
      },
      parentSlots() {
        return this.isDynamicLayoutContainer ? _.get(this.model, 'slots', _.get(this.vfg, 'model.slots', 12)) : 12
      },
      hasFileOrImageTypes() {
        // Check if there's a mapping configuration for file types
        const mapping = _.get(this.schema, 'options.mapping', {})
        return _.has(mapping, 'default') || _.some(_.keys(mapping), key => key !== 'default')
      },
      fileImageTypesMap() {
        const map = {}
        const mapping = _.get(this.schema, 'options.mapping', {})
        // Process each mapping entry
        _.each(mapping, (config, key) => {
          if (key === 'default') {
            return
          }
          const extensions = key.split(',').map(ext => ext.trim().toLowerCase())
          _.each(extensions, ext => {
            const normalizedExt = ext.startsWith('.') ? ext : '.' + ext
            if (!map[normalizedExt]) {
              map[normalizedExt] = []
            }
            map[normalizedExt].push({
              type: config._type,
              field: config.field
            })
          })
        })
        return map
      }
    },
    watch: {
      'schema.model': function () {
        this.items = _.cloneDeep(_.get(this.model, this.schema.model, []))
      }
    },
    async mounted () {
      this.getTypes()
      this.getSchemaForItems()
      await this.getSubResources()
      this.selectedType = _.first(this.types)
      FieldSelectorService.events.on('highlight-paragraph', this.onHighlightParagraph)
    },
    unmounted() {
      FieldSelectorService.events.off('highlight-paragraph', this.onHighlightParagraph)
    },
    methods: {
      getParagraphLevel() {
        return Math.max(0, (this.paragraphLevel || 1) - 1)
      },
      getLabel(item) {
        return _.get(item, 'label.enUS', _.get(item, 'label', false))
      },
      getDefaultParagraph() {
        return _.get(ResourceService.getParagraphSchema(_.get(this.schema, 'mapping.default', false)), 'displayname', false)
      },
      getItemClasses(idx, item) {
        const classes = ['item', `nested-level-${this.paragraphLevel}`]
        if (this.isHighlighted(idx)) {
          classes.push('highlighted')
        } else if (this.highlight.level !== -1 && this.highlight.index !== -1) {
          classes.push('not-highlighted')
        }
        if (this.isDynamicLayoutContainer) {
          const slots = this.getItemSlots(item)
          classes.push('dynamic-layout-item')
          classes.push(`slots-${slots}`)
          // a quarter of the row or less: widened to a third on tablets (see the styles)
          if (slots * 4 <= this.parentSlots) {
            classes.push('slots-narrow')
          }
        }
        return classes
      },
      // the block's slots: its own `slots`, else its paragraph type's layout.slots, else 2
      getItemSlots(item) {
        let slots = _.get(item, '_value.slots') || _.get(item, 'slots')
        if (!slots) {
          try {
            const paragraphType = _.get(item, '_type') || _.get(item, 'title')
            if (paragraphType) {
              slots = _.get(ResourceService.getParagraphSchema(paragraphType), 'layout.slots')
            }
          } catch (error) {
            console.warn('Could not get paragraph schema for slots:', _.get(item, '_type'), error)
          }
        }
        return slots || 2
      },
      getItemStyles(item) {
        if (this.isDynamicLayoutContainer) {
          const slots = this.getItemSlots(item)
          const percentage = (slots / this.parentSlots) * 100
          const itemsPerRow = Math.floor(this.parentSlots / slots)
          const totalGapInRow = Math.max(0, (itemsPerRow - 1) * 16)
          const gapPerItem = itemsPerRow > 1 ? totalGapInRow / itemsPerRow : 0
          const adjustedWidth = `calc(${percentage}% - ${gapPerItem}px)`
          return {
            flexBasis: adjustedWidth,
            maxWidth: adjustedWidth,
            width: adjustedWidth
          }
        }
        return {}
      },
      convertParagraph(item) {
        item._type = item.showConvert
        delete item.showConvert
        this.getSchemaForItems()
      },
      validateField () {
        return this.schema.required && _.get(this.items, 'length', 0) === 0 ? false : true
      },
      onHighlightParagraph(level, index) {
        this.highlight.level = level
        this.highlight.index = index
      },
      isHighlighted(idx) {
        return this.paragraphLevel === this.highlight.level && idx === this.highlight.index
      },
      async getSubResources() {
        await pAll(_.map(this.types, type => {
          return async () => {
            try {
              await this.requestResourcesForParagraph(type)
            } catch (error) {
              console.error(`Failed to get extra resource ${type.source}`, error)
            }
          }
        }), {concurrency: 1})
        this.subResourcesLoaded = true
      },
      getTypes() {
        this.types = _.compact(_.map(_.get(this, 'schema.types', []), (type)=> {
          const schema = ResourceService.getParagraphSchema(type)
          if (schema) {
            schema.input = 'group'
            schema.label = _.get(schema, 'displayname', schema.title)
            schema.field = schema.title
          } else {
            console.error(`Couldn't get schema for paragraph type ${type}`)
          }
          return schema
        }))
      },
      getSchemaForItems() {
        this.items = _.compact(_.map(_.compact(this.items), (item)=> {
          if (!_.get(item, 'input', false) || !_.get(item, 'label', false)) {
            if (this.schema.localised) {
              item.localised = true
            }
            if (_.get(item, '_type', false)) {
              const foundParagraphType = _.find(this.types, {field: item._type})
              if (!_.isUndefined(foundParagraphType)) {
                return _.extend(_.omit(foundParagraphType, ['_value', '_type']), {
                  _value: _.omit(item, '_type')
                })
              }
              const fieldName = _.get(this.schema, 'originalModel', _.get(this.schema, 'model', 'not-found'))
              console.error(`Paragraph of type ${item._type} is not allowed in field '${fieldName}', will show option to convert to`,_.get(this, 'schema.types', []))
            } else {
              console.error(`Couldn't determine paragraph type for item with label ${_.get(item, 'label', 'no-label')}, will show option to convert to`, _.get(this, 'schema.types', []))
            }
            item.showConvert = _.get(this.types, '[0].title', false)
            if (!item.showConvert) {
              item.cannotConvert = true
            }
          }
          return item
        }))
        this.items = _.toArray(this.items)
      },
      blockMoreItems() {
        return (this.disabled || this.schema.disabled) || (this.maxCount !== -1 && this.items.length >= this.maxCount)
      },
      onError (error) {
        console.error('ParagraphView - error', error)
      },
      validate () {
        _.each(this.$refs.vfg, vfg => {
          if (!vfg.validate()) {
            this.errors = vfg.errors
            throw new Error('group validation error')
          }
        })
        return true
      },
      getSchema (item, index) {
        let schemaItems = []
        const {resource, locale, userLocale, disabled} = this.schema
        if (item.input === 'group') {
          schemaItems = _.map(item.schema, schemaItems => {
            return _.extend({}, schemaItems, {
              field: `_value.${schemaItems.field}`,
              paragraphKey: this.fieldKey(index, schemaItems.field),
              paragraphType: item.title,
              localised: _.get(schemaItems, 'localised', false),
              label: schemaItems.label || schemaItems.field
            })
          })
        } else {
          schemaItems.push(_.extend({}, item, {
            field: '_value',
            localised: this.schema.localised
          }))
        }
        const extraSources = _.isString(item.source) ? _.get(ResourceService.getSchema(item.source), 'extraSources', {}) : {}
        const fields = SchemaService.getSchemaFields(schemaItems, resource, locale, userLocale, disabled, extraSources, this.schema.rootView || this)
        const groups = SchemaService.getNestedGroups(resource, fields, 0, null, '_value.')
        const schema = this.formatSchemaLayout({
          fields: groups,
          layout: item.layout
        })
        return schema
      },
      formatSchemaLayout (schema) {
        if (!_.get(schema, 'layout.lines', false)) {
          return schema
        }
        const alreadyPlacedFields = []
        _.each(schema.layout.lines, (line) => {
          line.slots = line.slots || _.get(line, 'fields.length', 1)
          let modelKey = ''
          _.each(line.fields, (field) => {
            field.schema = _.find(schema.fields, f =>{
              const locale = TranslateService.getLocales()
              modelKey = f.localised ? `_value.${field.model}.${locale[0]}` : `_value.${field.model}`
              return modelKey === f.model
            })
            if (_.isUndefined(field.schema)) {
              field.schema = _.find(schema.fields, {originalModel: field.model})
            }
            if (_.isUndefined(field.schema)) {
              console.error(`Couldn't find schema for field ${field.model}`)
            } else {
              alreadyPlacedFields.push(modelKey)
            }
          })
        })
        _.each(schema.fields, (field) => {
          if (!_.includes(alreadyPlacedFields, field.model) && !_.includes(alreadyPlacedFields, field.originalModel)) {
            console.warn(`Layout doesn't contain field ${field.model}, will not display it. To fix this, add the field to the layout of the paragraph resource.`)
            // schema.layout.lines.push({fields: [{model: field.model, schema: field}]})
          }
        })
        return schema
      },
      getAttachment (fileItemId, field) {
        const attach = _.find(this.model._attachments, {_fields: {fileItemId}})
        return field ? _.get(attach, field) : attach
      },
      onChangeType (type) {
        const foundType = _.find(this.types, {title: type})
        if (_.isUndefined(foundType)) {
          console.warn(`No type found for ${type} in types:`, this.types)
          return
        }
        this.selectedType = foundType
      },
      async requestResourcesForParagraph(paragraph) {
        // NOTE: Requests additional resources
        await pAll(_.map(paragraph.schema, (field)=> {
          return async () => {
            if (_.includes(['select', 'multiselect'], _.get(field, 'input', false)) && _.isString(_.get(field, 'source', false))) {
              const result = ResourceService.get(field.source)
              if (_.isUndefined(result)) {
                await ResourceService.cache(field.source)
              }
            }
          }
        }), {concurrency: 5})
      },
      async onClickAddNewItem () {
        if (!this.selectedType) {
          return
        }
        const newItem = _.cloneDeep(this.selectedType)
        await this.requestResourcesForParagraph(newItem)
        this.items.push(newItem)
        this.updateItems()
      },
      findIds (obj) {
        const ids = []
        _.each(obj, (value, key) => {
          if (key === 'id') {
            return ids.push(value)
          }
          if (_.isPlainObject(value) || _.isArray(value)) {
            ids.push(...this.findIds(value))
          }
        })
        return ids
      },
      onClickRemoveItem (item) {
        let attachments = _.get(this.model, '_attachments', [])
        if (_.includes(['image', 'file', 'group'], item.input)) {
          _.each(this.findIds(item), fileItemId => {
            attachments = _.reject(attachments, {_fields: {fileItemId}})
          })
        }
        _.set(this.model, '_attachments', attachments)
        this.items = _.difference(this.items, [item])
        this.key = crypto.randomUUID()
        this.updateItems()
      },
      onEndDrag () {
        this.key = crypto.randomUUID()
        this.updateItems()
      },
      onModelUpdated (value, model, paragraphIndex) {
        if (value instanceof Event) {
          return
        }
        _.set(this.items, `[${paragraphIndex}].${model}`, value)
        this.updateItems()
      },
      updateItems() {
        const items = _.compact(_.map(this.items, (item)=> {
          const obj = _.get(item, '_value', {})
          if (!_.get(item, 'title', false)) {
            console.error(`Title not found for paragraph item, cannot determine type. Item:`, item)
            return null
          }
          obj._type = item.title
          return obj
        }))
        this.$emit('input', items, this.schema.model)
      },
      toggleMultipleDropZone() {
        this.showMultipleDropZone = !this.showMultipleDropZone
      },
      onDragEnter(event) {
        event.preventDefault()
        this.isDragOver = true
      },
      onDragOver(event) {
        event.preventDefault()
        this.isDragOver = true
      },
      onDragLeave(event) {
        event.preventDefault()
        this.isDragOver = false
      },
      onDropFiles(event) {
        event.preventDefault()
        this.isDragOver = false
        const files = Array.from(event.dataTransfer.files)
        this.processFiles(files)
      },
      onSelectFiles(event) {
        const files = Array.from(event.target.files)
        this.processFiles(files)
        // Clear the input so the same file can be selected again
        event.target.value = ''
      },
      async processFiles(files) {
        // one after the other: each file gets its own block, mounted before the next one is made
        for (const file of files) {
          await this.processSingleFile(file)
        }
      },
      async processSingleFile(file) {
        const extension = '.' + file.name.split('.').pop().toLowerCase()
        const matchingTypes = this.fileImageTypesMap[extension]
        const mapping = _.get(this.schema, 'options.mapping', {})
        let paragraphConfig = null
        if (matchingTypes && matchingTypes.length > 0) {
          // Use the first matching type from mapping
          paragraphConfig = matchingTypes[0]
        } else if (_.has(mapping, 'default')) {
          // Use default mapping if no specific extension mapping found
          paragraphConfig = {
            type: mapping.default._type,
            field: mapping.default.field
          }
        }
        if (paragraphConfig) {
          // Find the paragraph type in our available types
          const paragraphType = _.find(this.types, { title: paragraphConfig.type })
          if (paragraphType) {
            await this.createParagraphWithFile(paragraphType, file, paragraphConfig.field)
          } else {
            this.$emit('notify', `Paragraph type ${paragraphConfig.type} is not available for file: ${file.name}`)
          }
        } else {
          this.$emit('notify', `No paragraph type supports files with extension: ${extension}`)
        }
      },
      async createParagraphWithFile(paragraphType, file, targetField) {
        const newItem = _.cloneDeep(paragraphType)
        // Only set title if we're NOT setting an image field (to avoid overwriting the image field)
        const titleField = _.find(newItem.schema, field => field.field === 'title')
        if (titleField && targetField !== 'image') {
          const fileName = file.name.split('.').slice(0, -1).join('.')
          _.set(newItem, '_value.title', fileName)
        }
        await this.requestResourcesForParagraph(newItem)
        this.items.push(newItem)
        this.updateItems()
        // the file waits for the file field of the new block, under the key that field gets (see getSchema): the field takes
        // it when it mounts, and runs its own checks and preview as for a file dropped on it
        const key = this.fieldKey(this.items.length - 1, targetField)
        queueFiles(key, [file])
        await this.$nextTick()
        await this.$nextTick()
        // still waiting: the block shows no such field (not in its layout, or not a file field)
        if (takeFiles(key).length) {
          this.$emit('notify', `${file.name}: ${targetField} is not a file field shown by ${paragraphType.title}`)
        }
      },
      // the paragraphKey of a field of a block, as getSchema gives it to the field
      fieldKey (index, field) {
        return `${this.paragraphLevel > 1 ? this.schema.paragraphKey : this.schema.model}[${index}].${field}`
      },
      getAllAcceptedTypes() {
        const mapping = _.get(this.schema, 'options.mapping', {})
        const extensions = []
        _.each(mapping, (config, key) => {
          if (key === 'default') {
            return
          }
          // Handle comma-separated extensions
          const keyExtensions = key.split(',').map(ext => {
            const trimmed = ext.trim().toLowerCase()
            return trimmed.startsWith('.') ? trimmed : '.' + trimmed
          })
          extensions.push(...keyExtensions)
        })
        return extensions.join(',')
      },
      getSupportedExtensions() {
        const mapping = _.get(this.schema, 'options.mapping', {})
        const extensions = []
        _.each(mapping, (config, key) => {
          if (key === 'default') {
            return
          }
          // Handle comma-separated extensions
          const keyExtensions = key.split(',').map(ext => {
            const trimmed = ext.trim().toLowerCase()
            return trimmed.startsWith('.') ? trimmed : '.' + trimmed
          })
          extensions.push(...keyExtensions)
        })
        return extensions.join(', ')
      }
    }
  }
</script>

<style lang="scss" scoped>
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
// the label, then the box that holds the blocks
.paragraph-field {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  > .paragraph-view {
    flex: 1 1 auto;
  }
  // the hint of the whole block sits under the label, before the box
  > .paragraph-hint {
    margin: 0 0 var(--cms-space-2);
  }
}

.paragraph-view {
  width: 100%;
  border: 2px $paragraph-top-bar-background solid;
  border-radius: 8px;
  padding: 8px;
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* Ensure sticky positioning context */
  overflow: visible;

  /* Create a stacking context for nested sticky elements */
  isolation: isolate;

  .paragraph-header-bar + .paragraph-content {
    padding-top: 16px;
  }
  .paragraph-content {
    flex: 1;
    /* Don't use overflow-y: auto here as it breaks sticky positioning for nested elements */
    /* Allow sticky elements to stick within this container */
    position: relative;
    /* Conditional padding-top: only when sticky header is displayed */
  }
}

.multiple-drop-zone {
  border: 2px dashed var(--cms-border-strong);
  border-radius: 8px;
  padding: 32px;
  margin: 16px 0;
  text-align: center;
  background-color: var(--cms-surface-2);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover, &.drag-over {
    border-color: var(--cms-primary);
    background-color: var(--cms-primary-soft);
  }

  .drop-zone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .drop-zone-text {
    display: flex;
    flex-direction: column;
    gap: 8px;
    .primary-text {
      font-size: 18px;
      font-weight: 500;
      color: var(--cms-text);
    }
    .secondary-text, .supported-types, .default {
      color: var(--cms-text-muted);
    }
    .secondary-text {
      font-size: 14px;
    }
    .supported-types, .default {
      font-style: italic;
      font-size: 12px;
    }
  }
}

.item {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  align-items: stretch;
  border: 2px $paragraph-top-bar-background solid;
  border-radius: 8px;
  /* Ensure nested paragraph sticky headers work */
  overflow: visible;

  .handle, .file-item-handle {
    cursor: pointer;
  }
  .handle {
    border-radius: 6px 6px 0 0 !important; /* follows the rounded border of the card (8px less its 2px border) */
    @include h5;
  }
  .file-item-handle {
    width: 20px;
    background-color: grey;
  }

  textarea, input {
    width: 100%;
  }
  textarea {
    height: 100px;
  }
  .row {
    display: flex;
    span {
      display: block;
      width: calc(100% - 50px);
      &:first-child {
        width: 50px;
      }
    }
  }
  .item-main {
    width: 100%;
    padding: 8px;
  }
  .file-item {
    display: flex;
    margin-bottom: 10px;
    textarea {
      height: 50px;
    }
  }

  .file-item-main {
    width: 100%;

    img {
      max-width: 200px;
      max-height: 113px;
    }
  }
}
.disabled {
  pointer-events: none;
}
// Add / remove buttons use the shared button system (base.scss); only alignment lives here
.add-new-item, .add-multiple-items {
  height: 40px;
}
.remove-item {
  max-height: 34px;
}
.add-btn-wrapper {
  display: flex;
  align-items: flex-end;
  gap: var(--cms-space-2);
}
.paragraph-footer, .paragraph-header, .paragraph-header-bar {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  width: 100%;
  justify-content: flex-start;
  gap: 16px;
}
.paragraph-header-bar {
  position: -webkit-sticky;
  position: sticky;
  top: calc(var(--paragraph-level, 0) * 80px);
  background-color: var(--cms-surface-2);
  border-bottom: 1px solid var(--cms-border);
  padding: 12px 8px;
  margin-top: 0;
  /* above the blocks it slides over, below menus and dialogs; a deeper level sits below its parent */
  z-index: calc(30 - var(--paragraph-level, 0));
  /* a hairline, not a shadow: the bar is part of the box, the top corners follow the box (8px less its 2px border) */
  border-radius: 6px 6px 0 0;

  /* Ensure sticky positioning works in nested contexts */
  align-self: flex-start;
  width: 100%;
  contain: layout style;
}
// the top corners of a block's header follow the rounded border of its card (8px less the 2px border);
// the selector is specific enough to win over Vuetify's rules for the first child of a card
.v-card.item > .v-card-title.paragraph-header {
  border-radius: 6px 6px 0 0;
}
.paragraph-header {
  background-color: $paragraph-top-bar-background;
  color: $paragraph-top-bar-color !important;
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: space-between;
  height: 34px;
  gap: var(--cms-space-1);
  padding-right: 0;
  padding-left: 16px;
  // the top corners follow the rounded border of the block card (8px less its 2px border)
  border-radius: 6px 6px 0 0;
  .paragraph-title {
    height: 100%;
    @include subtext;
  }
}

.item {
  @include nested-paragraphs;
}
.convert-paragraph {
  .convert-action {
    display: flex;
    align-items: flex-end;
    gap: 16px;
  }
  .error-message, .v-btn {
    @include cta-text;
  }
  .error-message {
    color: $cms-warning;
  }
  .v-btn {
    color: $btn-action-color;
    background-color: $btn-action-background;
  }
}

</style>
<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
.paragraph-view {
  .item-main-wrapper {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    flex: 1 0;
    /* Ensure nested sticky headers work */
    overflow: visible;

    > .v-btn {
      margin: 10px;
    }
    .field-wrapper {
      margin-bottom: 0;
    }
  }
  .paragraph-header-bar {
    .field-label {
      padding-left: 8px;
    }

    /* Make sure header items are properly aligned */
    .add-btn-wrapper {
      display: flex;
      align-items: center;
      justify-content: flex-start;

      .add-new-item {
        margin: 0;
        white-space: nowrap;
      }
    }

    /* Responsive layout for header */
    @media (max-width: 768px) {
      flex-direction: column;
      gap: 8px;

      .add-btn-wrapper {
        width: 100%;
        justify-content: center;
      }
    }
  }
  .custom-checkbox {
    margin-top: 12px;
  }
  .add-btn-wrapper {
    display: flex;
    justify-content: flex-end;
    gap: 8px;

    .add-new-item {
      margin: 0;
    }

    .add-multiple-items {
      margin: 0;
    }
  }
  .v-input {
    display: flex;
    flex-direction: column;
  }
  .v-card {
    pointer-events: auto;
    touch-action: auto;
    /* Ensure nested sticky headers work */
    overflow: visible;

    &.item {
      &.highlighted, &:hover:not(.not-highlighted) {
        @include highlight-paragraph;
      }
      &:hover {
        &:has(.v-card.item:hover) {
          @include nested-paragraphs;
          .v-card.item:hover {
            @include highlight-paragraph;
          }
        }
      }
    }
    &:not(.editor) {
      background-color: transparent;
      margin-bottom: 0;
      +.v-card.item {
        margin-top: vw(16px);
      }
    }
  }
}

// Dynamic layout styles
.paragraph-view {
  .dynamic-layout-container {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: stretch; // Make all items same height

    // Remove the default margin-bottom from items in dynamic layout
    .item {
      margin-bottom: 0 !important;
    }
    // Override the default +.v-card.item margin
    .v-card.item + .v-card.item {
      margin-top: 0 !important;
    }
    .dynamic-layout-item {
      flex-shrink: 0;
      flex-grow: 0;
      box-sizing: border-box;
      min-width: 0; // Prevent overflow
      // Ensure the item content doesn't break the layout
      .item-main {
        overflow: hidden;
      }
      .paragraph-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    // Responsive behavior for smaller screens
    @media (max-width: 768px) {
      .dynamic-layout-item {
        width: 100% !important;
        max-width: 100% !important;
        flex-basis: 100% !important;
      }
    }

    @media (max-width: 1024px) and (min-width: 769px) {
      .dynamic-layout-item {
        // On tablets, blocks of a quarter of the row or less are widened to a third
        &.slots-narrow {
          width: calc(33.33% - 10.667px) !important;
          max-width: calc(33.33% - 10.667px) !important;
          flex-basis: calc(33.33% - 10.667px) !important;
        }
      }
    }
  }
  &.can-add-more {
    >.paragraph-content {
      padding-top: calc((var(--paragraph-level, 0) - 1) * 80px);
    }
    >.paragraph-header-bar {
      top: calc((var(--paragraph-level, 0)) * 80px);
    }
  }
  &:not(.can-add-more) {
    >.paragraph-content {
      padding-top: calc((var(--paragraph-level, 0)) * 80px);
    }
    >.paragraph-header-bar {
      top: calc((var(--paragraph-level, 0) + 1) * 80px);
    }
  }
}
</style>
<style lang="scss">
.records {
  &.full-width {
    .paragraph-header-bar {
      top: calc((var(--paragraph-level, 0) - 1) * 80px);
    }
  }
}

</style>
