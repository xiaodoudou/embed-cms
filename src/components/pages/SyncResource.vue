<template>
  <div class="plugin-wrapper sync-resources">
    <div class="plugin-title">
      <h5>{{ $filters.translate('TL_SYNC_RESOURCE') }}</h5>
    </div>
    <p class="intro cms-text cms-text-muted">
      Copy the records of the resources to sync between this CMS and the other one: all of them at once, or one resource at a time after comparing the two.
    </p>
    <div v-if="resources" class="sync-body">
      <p v-if="resources.length === 0" class="no-resources cms-text" role="status">
        No resource is chosen to sync yet. Choose them in <a class="cms-link" href="#/?id=_sync">Sync settings</a>.
      </p>

      <sync-runs :resources="resources" @finished="onRunFinished" />

      <section class="one-resource cms-card" aria-labelledby="one-resource-title">
        <h2 id="one-resource-title" class="cms-h3">One resource</h2>
        <p class="cms-text cms-text-muted">Compare a resource with the other CMS, then push or pull just that one.</p>

        <div class="resource-choice">
          <label class="cms-label" for="sync-resource-select">Resource</label>
          <v-select
            id="sync-resource-select" v-model="selectedResource" :items="resources" item-text="name" item-value="name" :ripple="false"
            menu-icon="$chevronDown" placeholder="Choose a resource" persistent-placeholder
            flat rounded density="compact"
            hide-details variant="solo-filled" @update:model-value="onChangeResource"
          />
        </div>
        <p v-if="!selectedResource" class="choose-hint cms-text cms-text-muted">Choose a resource to see how many records each CMS has, and what a sync would change.</p>

        <div v-if="!isEmpty(recordData)" class="num-records">
          <div v-for="env in environments" :key="`env-${env}`" class="num-record" :num="environments.length">
            <span class="env">{{ environmentName(env) }}</span>
            <span v-if="get(recordData, `${env}.length`) !== undefined" class="count">{{ recordData[env].length }}<small>{{ recordData[env].length === 1 ? 'record' : 'records' }}</small></span>
            <span v-else class="na-field">N/A</span>
            <span v-if="hasAttachments && get(recordData, `${env}.length`) !== undefined" class="attachments-count">{{ attachmentCount(env) }} {{ attachmentCount(env) === 1 ? 'attachment' : 'attachments' }}</span>
            <span v-if="lastSync(env)" class="last-sync" :class="{ 'is-error': !lastSync(env).ok }">Last sync {{ lastSync(env).when }}: {{ lastSync(env).text }}</span>
          </div>
        </div>

        <div v-if="lastReport" class="report" :class="`is-${lastReport.status}`" role="status">
          <strong class="report-title">{{ lastReport.direction === 'push' ? 'Push' : 'Pull' }} {{ lastReport.status === 'done' ? 'done' : 'failed' }}: {{ lastReport.resource }}</strong>
          <span v-if="lastReport.status === 'done'" class="report-counts">{{ countsText(lastReport) }}<template v-if="tookText(lastReport)">, took {{ tookText(lastReport) }}</template></span>
          <template v-else>
            <span class="report-error">{{ lastReport.error }}</span>
            <span v-if="lastReport.created || lastReport.updated || lastReport.removed || lastReport.attachmentsAdded" class="report-counts">{{ countsText(lastReport) }}</span>
          </template>
        </div>

        <template v-if="!isEmpty(reportData) && comparable">
          <div v-if="isSyncing" class="syncing" role="status">
            <template v-for="env in environments" :key="`syncing-${env}`">
              <div v-if="get(syncStatus, `${env}.status`) === 'syncing'" class="syncing-env">
                <strong>{{ environmentName(env) }} is syncing {{ get(syncStatus, `${env}.resource`) }}</strong>
                <span>created: {{ get(syncStatus, `${env}.created`) }} / {{ get(syncStatus, `${env}.createTotal`) }}</span>
                <span>updated: {{ get(syncStatus, `${env}.updated`) }} / {{ get(syncStatus, `${env}.updateTotal`) }}</span>
                <span>removed: {{ get(syncStatus, `${env}.removed`) }} / {{ get(syncStatus, `${env}.removeTotal`) }}</span>
              </div>
            </template>
          </div>
          <div v-else class="directions">
            <div class="direction is-push">
              <h3 class="cms-h4">Push to the other CMS</h3>
              <p class="cms-text-sm cms-text-muted">The other CMS ends with the records of this one.</p>
              <ul class="changes">
                <li>create: {{ reportData.create }}</li>
                <li>update: {{ reportData.update }}</li>
                <li>remove: {{ reportData.remove }}</li>
                <li v-if="hasAttachments" class="attachments">attachments: copy {{ attachmentChanges('local', 'remote').add }}, remove {{ attachmentChanges('local', 'remote').remove }}</li>
              </ul>
              <v-btn v-if="canPush" class="push" variant="flat" color="primary" rounded size="small" prepend-icon="$arrowUp" @click="onClickDeploy('local', 'remote')">Push to the other CMS</v-btn>
              <p v-else class="cms-text-sm cms-text-muted not-allowed">The other CMS does not allow writing.</p>
            </div>
            <div class="direction is-pull">
              <h3 class="cms-h4">Pull from the other CMS</h3>
              <p class="cms-text-sm cms-text-muted">This CMS ends with the records of the other one.</p>
              <ul class="changes">
                <li>create: {{ reportData.remove }}</li>
                <li>update: {{ reportData.update }}</li>
                <li>remove: {{ reportData.create }}</li>
                <li v-if="hasAttachments" class="attachments">attachments: copy {{ attachmentChanges('remote', 'local').add }}, remove {{ attachmentChanges('remote', 'local').remove }}</li>
              </ul>
              <v-btn v-if="canPull" class="pull" variant="outlined" rounded size="small" prepend-icon="$arrowDown" @click="onClickDeploy('remote', 'local')">Pull from the other CMS</v-btn>
              <p v-else class="cms-text-sm cms-text-muted not-allowed">This CMS does not allow writing.</p>
            </div>
          </div>
        </template>
      </section>
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
  import SyncRuns from '@c/pages/SyncRuns.vue'

  export default {
    components: { SyncRuns },
    data () {
      return {
        statusInterval: null,
        error: null,
        // the resources this CMS may sync (the choice of the Sync settings, else the list of cms.json)
        resources: null,
        selectedResource: null,
        recordData: {},
        reportData: {},
        syncStatus: {},
        uniqueKeyMap: {},
        environments: ['local', 'remote'],
        syncingEnvironment: null,
        // the push or pull that was started from here: { from, to }; and how it ended (kept until another resource is chosen)
        deploy: null,
        lastReport: null,
        isEmpty: _.isEmpty,
        get: _.get,
        includes: _.includes
      }
    },
    computed: {
      // both servers could be read, so that they can be compared
      comparable () {
        return _.get(this.recordData, 'local.length') !== undefined && _.get(this.recordData, 'remote.length') !== undefined
      },
      // some record on either CMS has a file: the numbers of attachments are shown
      hasAttachments () {
        return this.attachmentCount('local') > 0 || this.attachmentCount('remote') > 0
      },
      /** @returns {boolean} */
      isSyncing () {
        return !!_.find(this.syncStatus, { status: 'syncing' })
      },
      // a push writes to the other CMS, a pull writes here: each needs the side it writes to to allow it
      canPush () {
        return _.includes(_.get(this.syncStatus, 'remote.allows'), 'write')
      },
      /** @returns {boolean} whether this CMS allows writes */
      canPull () {
        return _.includes(_.get(this.syncStatus, 'local.allows'), 'write')
      }
    },
    unmounted () {
      if (this.statusInterval) {
        clearInterval(this.statusInterval)
      }
    },
    async mounted () {
      const data = await ResourceService.getAll()
      _.each(data, resource => {
        const uniqueKeyField = _.find(resource.schema, {unique: true})
        if (uniqueKeyField) {
          this.uniqueKeyMap[resource.title] = uniqueKeyField.field
        }
      })
      this.resources = await RequestService.get(`../sync/resources`)
      if (this.selectedResource) {
        this.update()
      }
      this.statusInterval = setInterval(async () => {
        if (this.selectedResource) {
          try {
            await pAll(_.map(['local', 'remote'], env => {
              return async () => {
                try {
                  // read the status first: the other environment may replace this.syncStatus while we wait
                  const status = await RequestService.get(`../sync/${env}/${this.selectedResource}/status`)
                  this.syncStatus[env] = status
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
            this.lastReport = this.buildReport(failed)
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
      /**
       * @param {'local'|'remote'} env
       * @returns {string}
       */
      environmentName (env) {
        return env === 'local' ? 'This CMS' : 'The other CMS'
      },
      /** Drops the last report and loads the new resource. */
      onChangeResource () {
        this.lastReport = null
        this.update()
      },
      /**
       * How the push or pull that was started here ended, from the report of the CMS it wrote to.
       * @param {object} [failed] the status of the CMS that failed, when one did
       */
      buildReport (failed) {
        const written = failed || _.get(this.syncStatus, _.get(this.deploy, 'to', 'remote'), {})
        return {
          direction: _.get(this.deploy, 'from') === 'remote' ? 'pull' : 'push',
          resource: this.selectedResource,
          status: failed ? 'error' : 'done',
          created: written.created || 0,
          updated: written.updated || 0,
          removed: written.removed || 0,
          attachmentsAdded: written.attachmentsAdded,
          attachmentsRemoved: written.attachmentsRemoved,
          error: failed ? _.toString(failed.error) : '',
          startedAt: written.startedAt,
          finishedAt: written.stopAt
        }
      },
      // what the last sync that wrote to a CMS did, from its report: null when none has run since it started
      lastSync (env) {
        const status = _.get(this.syncStatus, env)
        if (!status || !status.stopAt || !_.includes(['done', 'error'], status.status)) {
          return null
        }
        return {
          ok: status.status === 'done',
          when: new Date(status.stopAt).toLocaleString(),
          text: status.status === 'done' ? this.countsText(status) : _.toString(status.error)
        }
      },
      // what a sync did: the records, and the attachments (files) when it copied or removed some
      countsText (report) {
        const files = _.isNumber(report.attachmentsAdded) ? `, attachments added ${report.attachmentsAdded || 0}, removed ${report.attachmentsRemoved || 0}` : ''
        return `created ${report.created || 0}, updated ${report.updated || 0}, removed ${report.removed || 0}${files}`
      },
      /**
       * @param {'local'|'remote'} env
       * @returns {number} the attachments of its records
       */
      attachmentCount (env) {
        return _.sumBy(_.get(this.recordData, env), item => _.size(item._attachments))
      },
      /**
       * What copying the attachments from one CMS to the other would add and remove there: for a record that is not in the other CMS,
       * all of its files; for one that is, the files of each field whose files are not the same (by their md5); and the files of the
       * records that only the other CMS has, which go with them.
       * @param {'local'|'remote'} from
       * @param {'local'|'remote'} to
       * @returns {{add: number, remove: number}}
       */
      attachmentChanges (from, to) {
        const uniqueKey = this.uniqueKeyMap[this.selectedResource]
        const fromData = _.get(this.recordData, from, [])
        const toData = _.get(this.recordData, to, [])
        // a file that is the same (content and name) is not copied again: only the ones that are not on both sides count
        const key = (attach) => `${attach._md5sum}|${attach._filename}|${JSON.stringify(_.pick(attach, ['_payload', 'cropOptions', 'order', '_fields']))}`
        let add = 0
        let remove = 0
        _.each(fromData, item => {
          const match = _.find(toData, other => _.isEqual(other[uniqueKey], item[uniqueKey]))
          const fromFields = _.groupBy(item._attachments, '_name')
          const toFields = _.groupBy(_.get(match, '_attachments'), '_name')
          _.each(_.union(_.keys(fromFields), _.keys(toFields)), name => {
            const kept = _.countBy(toFields[name], key)
            _.each(fromFields[name], attach => {
              if (kept[key(attach)] > 0) {
                kept[key(attach)] -= 1
              } else {
                add += 1
              }
            })
            remove += _.sum(_.values(kept))
          })
        })
        _.each(toData, other => {
          if (!_.find(fromData, item => _.isEqual(item[uniqueKey], other[uniqueKey]))) {
            remove += _.size(other._attachments)
          }
        })
        return { add, remove }
      },
      /**
       * @param {{startedAt?: number, finishedAt?: number}} report
       * @returns {string} the duration, empty without both times
       */
      tookText (report) {
        if (!report.startedAt || !report.finishedAt) {
          return ''
        }
        return `${Math.max(0, Math.round((report.finishedAt - report.startedAt) / 100) / 10)}s`
      },
      // a run of all the resources ended: the records of the one that is open have changed
      onRunFinished () {
        if (this.selectedResource) {
          this.update()
        }
      },
      /** Loads the records of both sides for the selected resource. */
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
          // by value: the unique field of a record can be one text per language
          let updateKeys = _.intersectionWith(fromKeys, toKeys, _.isEqual)
          updateKeys = _.filter(updateKeys, key => {
            const fromItem = _.find(fromData, item => _.isEqual(item[uniqueKey], key))
            const toItem = _.find(toData, item => _.isEqual(item[uniqueKey], key))
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
            create: _.differenceWith(fromKeys, toKeys, _.isEqual).length,
            remove: _.differenceWith(toKeys, fromKeys, _.isEqual).length,
            update: updateKeys.length
          }
        } catch (error) {
          console.error(error)
        }
        this.$loading.stop('loading-resource')
      },
      /**
       * @param {'local'|'remote'} from
       * @param {'local'|'remote'} to
       */
      async onClickDeploy (from, to) {
        this.error = null
        this.$loading.start('deploy-resource')

        this.syncingEnvironment = true
        this.deploy = { from, to }
        this.lastReport = null
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
.sync-resources {
  padding: 0 0 var(--cms-space-6);

  // the title brings its own padding: the rest lines up with it
  .intro, .sync-body, .bg-error {
    margin-inline: var(--cms-space-6);
  }

  .intro {
    margin-block: 0 var(--cms-space-4);
    max-width: 70ch;
  }

  .sync-body {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-4);
    max-width: var(--cms-content-max);
    min-width: 0;
  }

  .no-resources { margin: 0; }

  .one-resource {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-3);
    padding: var(--cms-space-4);

    h2, h3, p, ul { margin: 0; }
  }

  .resource-choice {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-1);
    max-width: 420px;
  }

  .num-records {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--cms-space-3);
  }

  .num-record {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-1);
    padding: var(--cms-space-3) var(--cms-space-4);
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-md);
    background: var(--cms-surface-2);

    .env {
      font-size: var(--cms-fs-sm);
      font-weight: var(--cms-fw-semibold);
      color: var(--cms-text-muted);
    }

    .count {
      font-size: var(--cms-fs-2xl);
      font-weight: var(--cms-fw-bold);
      line-height: var(--cms-lh-tight);
      small {
        margin-inline-start: var(--cms-space-2);
        font-size: var(--cms-fs-sm);
        font-weight: var(--cms-fw-regular);
        color: var(--cms-text-muted);
      }
    }

    .na-field {
      font-size: var(--cms-fs-lg);
      color: var(--cms-text-muted);
    }
  }

  .attachments-count {
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
  }

  .last-sync {
    margin-block-start: var(--cms-space-1);
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
    &.is-error { color: var(--cms-error); }
  }

  // how the push or pull started here ended
  .report {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--cms-space-1) var(--cms-space-4);
    padding: var(--cms-space-3) var(--cms-space-4);
    border-radius: var(--cms-radius-md);
    background: var(--cms-success-soft);
    color: var(--cms-success);
    .report-counts, .report-error { color: var(--cms-text); overflow-wrap: anywhere; }
    &.is-error {
      background: var(--cms-error-soft);
      color: var(--cms-error);
    }
  }

  .syncing {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-2);
    padding: var(--cms-space-3) var(--cms-space-4);
    border-radius: var(--cms-radius-md);
    background: var(--cms-primary-soft);
    color: var(--cms-on-primary-soft);
  }

  .syncing-env {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-1) var(--cms-space-4);
  }

  .directions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--cms-space-3);
  }

  .direction {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--cms-space-2);
    padding: var(--cms-space-3) var(--cms-space-4);
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-md);
  }

  .changes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-1) var(--cms-space-4);
    padding: 0;
    list-style: none;
    font-variant-numeric: tabular-nums;
  }
}

@media (max-width: 899.98px) {
  .sync-resources {
    .intro, .sync-body, .bg-error { margin-inline: var(--cms-space-4); }
  }
}
</style>
