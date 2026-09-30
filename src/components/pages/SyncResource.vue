<template>
  <div class="sync-resources main">
    <h1>Sync Resources</h1>
    <div v-if="config">
      <v-select
        v-model="selectedResource" :items="config.sync.resources" item-text="name" item-value="name" :ripple="false"
        menu-icon="$chevronDown"
        flat rounded
        density="compact" hide-details variant="solo-filled"
      />
      <div v-if="!isEmpty(recordData)" class="num-records">
        <span>number of records</span>
        <div class="num-records-wrapper">
          <div v-for="env in environments" :key="`env-${env}`" class="num-record" :num="environments.length">
            <span>{{ env }}</span>
            <span>{{ get(recordData, `${env}.length`, 'N/A') }}</span>
          </div>
        </div>
      </div>
      <div v-if="!isEmpty(reportData)" class="num-records">
        <span>records difference</span>
        <div class="num-records-wrapper">
          <div class="num-record" num="1" :set="enabled = get(recordData, 'local.length') !== undefined && get(recordData, 'remote.length') !== undefined">
            <template v-if="enabled">
              <template v-if="get(syncStatus, 'local.status') !== 'syncing' && get(syncStatus, 'remote.status') !== 'syncing'">
                <span>local / remote</span>
                <span>create: {{ reportData.create }}</span>
                <span>update: {{ reportData.update }}</span>
                <span>remove: {{ reportData.remove }}</span>
                <span v-if="includes(get(syncStatus, 'remote.allows'), 'write')"><button @click="onClickDeploy('local', 'remote')">push to remote</button></span>
                <span v-if="includes(get(syncStatus, 'local.allows'), 'write')"><button @click="onClickDeploy('remote', 'local')">pull from remote</button></span>
              </template>
              <template v-if="get(syncStatus, 'local.status') === 'syncing'">
                <span>resource: {{ get(syncStatus, `local.resource`) }}</span>
                <span>created: {{ get(syncStatus, `local.created`) }} / {{ get(syncStatus, `local.createTotal`) }}</span>
                <span>updated: {{ get(syncStatus, `local.updated`) }} / {{ get(syncStatus, `local.updateTotal`) }}</span>
                <span>removed: {{ get(syncStatus, `local.removed`) }} / {{ get(syncStatus, `local.removeTotal`) }}</span>
              </template>
              <template v-if="get(syncStatus, 'remote.status') === 'syncing'">
                <span>resource: {{ get(syncStatus, `remote.resource`) }}</span>
                <span>created: {{ get(syncStatus, `remote.created`) }} / {{ get(syncStatus, `remote.createTotal`) }}</span>
                <span>updated: {{ get(syncStatus, `remote.updated`) }} / {{ get(syncStatus, `remote.updateTotal`) }}</span>
                <span>removed: {{ get(syncStatus, `remote.removed`) }} / {{ get(syncStatus, `remote.removeTotal`) }}</span>
              </template>
            </template>
            <span v-if="!enabled" class="na-field">
              N/A
            </span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="error" class="bg-error">
      Error: {{ error }}
    </div>
  </div>
</template>

<script>
  import { log } from '@u/log'
  import RequestService from '@s/RequestService'
  import NotificationsService from '@s/NotificationsService'
  import TranslateService from '@s/TranslateService'
  import { importCounts } from '@u/recordLabel'
  import ResourceService from '@s/ResourceService'
  import _ from 'lodash'
  import pAll from 'p-all'

  export default {
    data () {
      return {
        statusInterval: null,
        error: null,
        config: null,
        selectedResource: null,
        recordData: {},
        reportData: {},
        syncStatus: {},
        uniqueKeyMap: {},
        environments: ['local', 'remote'],
        syncingEnvironment: null,
        isEmpty: _.isEmpty,
        get: _.get,
        includes: _.includes
      }
    },
    unmounted () {
      if (this.statusInterval) {
        clearInterval(this.statusInterval)
      }
    },
    async mounted () {
      let data = await ResourceService.getAll()
      _.each(data, resource => {
        let uniqueKeyField = _.find(resource.schema, {unique: true})
        if (uniqueKeyField) {
          this.uniqueKeyMap[resource.title] = uniqueKeyField.field
        }
      })
      this.config = await RequestService.get(`../config`)
      if (this.selectedResource) {
        this.update()
      }
      this.statusInterval = setInterval(async () => {
        if (this.selectedResource) {
          try {
            await pAll(_.map(['local', 'remote'], env => {
              return async () => {
                try {
                  this.syncStatus[env] = await RequestService.get(`../sync/${env}/${this.selectedResource}/status`)
                  this.syncStatus = _.clone(this.syncStatus)
                } catch (error) {
                  console.error(error)
                }
              }
            }))
          } catch (error) {
            console.error(error)
          }

          const result = _.find(this.syncStatus, {status: 'syncing'})
          if (!result && this.syncingEnvironment) {
            const failed = _.find(this.syncStatus, { status: 'error' })
            if (failed) {
              NotificationsService.send(TranslateService.get('TL_IMPORT_FAILED', { name: `Sync ${this.selectedResource}`, error: _.toString(failed.error) }), 'error')
            } else {
              NotificationsService.send(TranslateService.get('TL_IMPORT_DONE', { name: `Sync ${this.selectedResource}`, counts: importCounts(this.reportData) }), 'success')
            }
            this.$loading.stop('deploy-resource')
            if (result && result.status === 'error') {
              this.error = result.error
            }
            this.syncingEnvironment = false
            this.update()
          }
        }
      }, 5 * 1000)
    },
    methods: {
      onChangeResource () {
        this.update()
      },
      async update () {
        this.$loading.start('loading-resource')
        try {
          const uniqueKey = this.uniqueKeyMap[this.selectedResource]
          this.recordData = {}
          this.reportData = {}
          await pAll(_.map(this.environments, env => {
            return async () => {
              try {
                let data = await RequestService.get(`../sync/${env}/${this.selectedResource}`)
                _.set(this.recordData, env, data)
                data = await RequestService.get(`../sync/${env}/${this.selectedResource}/status`)
                _.set(this.syncStatus, env, data)
                this.syncStatus = _.clone(this.syncStatus)
              } catch (error) {
                console.error(error)
              }
            }
          }), {concurrency: 1})
          this.recordData = _.clone(this.recordData)
          const fromData = this.recordData.local
          const toData = this.recordData.remote
          const fromKeys = _.map(fromData, item => item[uniqueKey])
          const toKeys = _.map(toData, item => item[uniqueKey])
          let updateKeys = _.intersection(fromKeys, toKeys)
          updateKeys = _.filter(updateKeys, key => {
            let fromItem = _.find(fromData, item => (item[uniqueKey]) === key)
            let toItem = _.find(toData, item => (item[uniqueKey]) === key)
            fromItem._attachments = _.map(fromItem._attachments, item => _.omit(item, ['url']))
            toItem._attachments = _.map(toItem._attachments, item => _.omit(item, ['url']))
            return !_.isEqual(fromItem, toItem)
          })
          if (!_.isEmpty(updateKeys)) {
            _.each(updateKeys, key => {
              log.debug(key, 'local', _.find(fromData, {[uniqueKey]: key}), 'remote', _.find(toData, {[uniqueKey]: key}))
            })
          }
          this.reportData = {
            create: _.difference(fromKeys, toKeys).length,
            remove: _.difference(toKeys, fromKeys).length,
            update: updateKeys.length
          }
        } catch (error) {
          console.error(error)
        }
        this.$loading.stop('loading-resource')
      },
      async onClickDeploy (from, to) {
        this.error = null
        this.$loading.start('deploy-resource')

        this.syncingEnvironment = true
        try {
          await RequestService.post(`../sync/${this.selectedResource}/from/${from}/to/${to}`)
          _.set(this.syncStatus, `${to}.status`, 'syncing')
          this.syncStatus = _.clone(this.syncStatus)
          NotificationsService.send(TranslateService.get('TL_IMPORT_STARTED', { name: `Sync ${this.selectedResource}` }), 'info')
        } catch (error) {
          console.error(error)
          NotificationsService.send(TranslateService.get('TL_IMPORT_FAILED', { name: `Sync ${this.selectedResource}`, error: _.get(error, 'message', 'error') }), 'error', {
            actionLabel: TranslateService.get('TL_RETRY'),
            action: () => this.onClickDeploy(from, to)
          })
          this.syncingEnvironment = false
          this.$loading.stop('deploy-resource')
        }
      }
    }
  }
</script>

<style lang="scss" scoped>
.main {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: var(--cms-space-4) 0 var(--cms-space-8);
  margin: 0 var(--cms-space-6);
  max-width: var(--cms-content-max);
  box-sizing: border-box;
  flex: 1 1 0;
  overflow-y: auto;
  font-size: var(--cms-fs-base);
}

h1 {
  margin: 0 0 var(--cms-space-4);
  font-size: var(--cms-fs-2xl);
  line-height: var(--cms-lh-tight);
  font-weight: var(--cms-fw-bold);
}

.bg-error {
  margin-top: var(--cms-space-4);
  padding: var(--cms-space-3) var(--cms-space-4);
  border-radius: var(--cms-radius-md);
}

.num-records {
  width: 100%;
  margin: var(--cms-space-5) 0 0;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface);
  overflow: hidden;
  > span {
    display: block;
    padding: var(--cms-space-2) var(--cms-space-4);
    background-color: var(--cms-surface-2);
    border-bottom: 1px solid var(--cms-border);
    font-weight: var(--cms-fw-semibold);
    color: var(--cms-text);
    text-transform: capitalize;
  }
  .num-records-wrapper {
    display: flex;
    flex-wrap: wrap;
    padding: 0;
    margin: 0;
    .num-record {
      flex: 1 1 160px;
      text-align: center;
      min-width: 0;

      span {
        padding: var(--cms-space-2);
        display: block;
        border-right: 1px solid var(--cms-border);
        &:first-child {
          background-color: var(--cms-surface-2);
          border-bottom: 1px solid var(--cms-border);
          font-weight: var(--cms-fw-medium);
        }
      }
      .na-field {
        line-height: 100px;
        height: 100px;
        display: block;
        color: var(--cms-text-muted);
      }
      &:last-child {
        span {
          border-right: 0;
        }
      }
      button {
        width: calc(100% - var(--cms-space-4));
        margin: var(--cms-space-1) 0;
        min-height: 36px;
        border: 0;
        border-radius: var(--cms-radius-sm);
        background: var(--cms-primary);
        color: var(--cms-on-primary);
        font: inherit;
        font-weight: var(--cms-fw-semibold);
        cursor: pointer;
        &:hover {
          background: var(--cms-primary-hover);
        }
      }
    }
  }
}

@media (max-width: 599.98px) {
  .main {
    margin: 0 var(--cms-space-3);
  }
}
</style>
