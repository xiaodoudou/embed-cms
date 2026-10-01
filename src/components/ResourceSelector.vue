<template>
  <v-menu v-if="group && groupedList" v-model="opened" :content-class="`resources-menu ${fullWidth ? 'full-width' : 'sidebar'}`" location="bottom" :close-on-content-click="true">
    <template #activator="{ props }">
      <button type="button" class="resource-selector" :class="{opened}" aria-haspopup="menu" :aria-expanded="opened ? 'true' : 'false'" v-bind="props">
        <span class="resource-title">{{ titleOf(resource) }}</span>
        <v-icon icon="$chevronDown" />
      </button>
    </template>
    <v-list rounded>
      <v-list-item
        v-for="r in group.list" :key="r.name" density="compact" :class="{selected: r === resource}"
        @click="onSelect(r)"
      >
        <v-list-item-title>{{ titleOf(r) }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script>
  import _ from 'lodash'
  import TranslateService from '@s/TranslateService'

  /** The resource title bar with the dropdown that lists the other resources of the same group (list and table view). */
  export default {
    props: {
      resource: { type: [Object, Boolean], default: () => ({}) },
      groupedList: { type: [Array, Boolean], default: () => [] },
      selectCallback: { type: Function, default: () => {} },
      fullWidth: { type: Boolean, default: false }
    },
    data () {
      return { opened: false }
    },
    computed: {
      group () {
        return _.find(this.groupedList, (resourceGroup) => this.groupSelected(resourceGroup))
      }
    },
    methods: {
      titleOf (resource) {
        if (!resource) {
          return ''
        }
        return resource.displayname ? TranslateService.get(resource.displayname) : resource.title
      },
      onSelect (resource) {
        if (resource !== this.resource && _.isFunction(this.selectCallback)) {
          this.selectCallback(resource)
        }
      },
      groupSelected (resourceGroup) {
        if (!this.resource) {
          return false
        }
        const selectedItemGroup = _.get(this.resource, 'group.enUS', _.get(this.resource, 'group', false))
        const groupName = _.get(resourceGroup, 'name.enUS', resourceGroup.name)
        if (groupName === 'TL_OTHERS' && !selectedItemGroup) {
          return true
        }
        return groupName === selectedItemGroup
      }
    }
  }
</script>
