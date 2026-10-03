<template>
  <section class="sync-runs cms-card" aria-labelledby="sync-runs-title">
    <header class="head">
      <div class="head-text">
        <h2 id="sync-runs-title" class="cms-h3">All the resources</h2>
        <p class="cms-text cms-text-muted intro">
          Push or pull every resource chosen in <a class="cms-link" href="#/?id=_sync">Sync settings</a>, one after the other.
          A push writes to the other CMS, and removes there the records this CMS does not have. A pull does the same here.
        </p>
        <div class="chosen">
          <span class="chosen-label cms-text-sm cms-text-muted">{{ resources.length === 1 ? '1 resource' : `${resources.length} resources` }} to sync:</span>
          <ul v-if="resources.length" class="chips" aria-label="Resources to sync">
            <li v-for="name in resources" :key="name" class="chip" :class="`is-${chipState(name)}`" :title="chipTitle(name)">{{ name }}</li>
          </ul>
          <span v-else class="none cms-text-sm cms-text-muted">none chosen</span>
          <a class="change cms-link cms-text-sm" href="#/?id=_sync">Change</a>
        </div>
      </div>
      <div class="actions">
        <v-btn class="push-all" variant="flat" color="primary" rounded size="small" prepend-icon="$arrowUp" :disabled="busy || resources.length === 0" @click="start('push')">Push all</v-btn>
        <v-btn class="pull-all" variant="outlined" rounded size="small" prepend-icon="$arrowDown" :disabled="busy || resources.length === 0" @click="start('pull')">Pull all</v-btn>
      </div>
    </header>

    <p v-if="running" class="running cms-text" role="status">
      <strong>{{ capital(running.direction) }}</strong> {{ triggerText(running.trigger) }}:
      <template v-if="running.current">{{ running.current }} ({{ running.results.length + 1 }} of {{ running.resources.length }})</template>
      <template v-else>finishing</template>
    </p>

    <div class="panels">
      <div class="panel last-run">
        <h3 class="cms-h4">{{ running ? 'So far' : 'Last run' }}</h3>
        <div v-if="shown" class="run">
          <p class="cms-text-sm cms-text-muted when">
            {{ capital(shown.direction) }} {{ triggerText(shown.trigger) }}, {{ when(shown.startedAt) }}<template v-if="shown.finishedAt">, {{ seconds(shown) }}</template>
          </p>
          <ul class="results">
            <li v-for="result in shown.results" :key="result.resource" class="result" :class="`is-${result.status}`">
              <span class="resource">{{ result.resource }}</span>
              <span v-if="result.status === 'done'" class="outcome">done: {{ counts(result) }}</span>
              <span v-else class="outcome">failed: {{ result.error }}<template v-if="result.created || result.updated || result.removed || result.attachmentsAdded"> ({{ counts(result) }})</template></span>
            </li>
          </ul>
        </div>
        <p v-else class="nothing cms-text-sm cms-text-muted">Nothing has run yet.</p>
      </div>

      <div class="panel schedule-panel">
        <h3 class="cms-h4 schedule-title">Schedule</h3>
        <ul v-if="scheduled.length" class="schedule">
          <li v-for="item in scheduled" :key="item.direction" class="scheduled" :data-direction="item.direction">
            <strong>{{ capital(item.direction) }}</strong>
            <code class="cms-code">{{ item.cron }}</code>
            <span class="next cms-text-sm cms-text-muted">{{ item.next ? `next ${when(item.next, timeZone)} (server time, ${timeZone})` : 'never comes' }}</span>
          </li>
        </ul>
        <p v-else class="no-schedule cms-text-sm cms-text-muted">
          Nothing is scheduled. To sync on its own, add a schedule to <code class="cms-code">cms.json</code>, for example
          <code class="cms-code">"sync": { "schedule": { "push": "0 3 * * *" } }</code> for a push every night at 3.
        </p>
      </div>
    </div>
  </section>
</template>

<script>
  import _ from 'lodash'
  import RequestService from '@s/RequestService'
  import NotificationsService from '@s/NotificationsService'

  const POLL_MS = 2000

  const TRIGGERS = { manual: 'started from the admin or the command line', schedule: 'by the schedule', api: 'from code' }

  // The section of the Sync page that runs every resource at once: buttons, how the run goes, how the last one went, and the schedule.
  export default {
    props: {
      // the resources this CMS may sync
      resources: { type: Array, default: () => [] }
    },
    emits: ['finished'],
    data () {
      return { running: false, last: null, schedule: { push: null, pull: null }, timeZone: undefined, starting: false, timer: null }
    },
    computed: {
      busy () {
        return !!this.running || this.starting
      },
      // the run that goes on, else the last one
      shown () {
        return this.running || this.last
      },
      scheduled () {
        return _.filter(_.map(['push', 'pull'], (direction) => ({ direction, ...this.schedule[direction] })), 'cron')
      }
    },
    async mounted () {
      await this.refresh()
      this.timer = setInterval(this.refresh, POLL_MS)
    },
    beforeUnmount () {
      clearInterval(this.timer)
    },
    methods: {
      capital: _.upperFirst,
      // what a run does to a resource while it goes on: waiting, being synced, done, failed; nothing when no run goes on
      chipState (name) {
        if (!this.running) {
          return 'idle'
        }
        const result = _.find(this.running.results, { resource: name })
        if (result) {
          return result.status
        }
        if (this.running.current === name) {
          return 'running'
        }
        return _.includes(this.running.resources, name) ? 'pending' : 'idle'
      },
      chipTitle (name) {
        return { idle: '', pending: 'Waiting', running: 'Syncing now', done: 'Done', error: 'Failed' }[this.chipState(name)]
      },
      triggerText (trigger) {
        return TRIGGERS[trigger] || trigger
      },
      // a time in the time zone given (the one of the server for the schedule), else the one of the browser
      when (time, timeZone) {
        return new Date(time).toLocaleString(undefined, timeZone ? { timeZone } : undefined)
      },
      seconds (run) {
        const taken = Math.max(0, Math.round((run.finishedAt - run.startedAt) / 100) / 10)
        return `${taken}s`
      },
      counts (result) {
        const files = _.isNumber(result.attachmentsAdded) ? `, attachments added ${result.attachmentsAdded || 0}, removed ${result.attachmentsRemoved || 0}` : ''
        return `created ${result.created || 0}, updated ${result.updated || 0}, removed ${result.removed || 0}${files}`
      },
      async refresh () {
        try {
          const state = await RequestService.get('../sync/runs')
          const wasRunning = !!this.running
          this.running = state.running || false
          this.last = state.last || null
          this.schedule = { push: null, pull: null, ...state.schedule }
          this.timeZone = state.timeZone
          if (wasRunning && !this.running) {
            this.$emit('finished')
          }
        } catch (error) {
          console.error(error)
        }
      },
      async start (direction) {
        const confirmed = await window.DialogService.ask({
          title: `${_.upperFirst(direction)} all the resources?`,
          message: direction === 'push'
            ? 'The other CMS will end with the records of this one: records that exist only there are removed.'
            : 'This CMS will end with the records of the other one: records that exist only here are removed.',
          confirm: _.upperFirst(direction),
          cancel: 'Cancel'
        })
        if (!confirmed) {
          return
        }
        this.starting = true
        try {
          await RequestService.post(`../sync/run/${direction}`)
          await this.refresh()
        } catch (error) {
          NotificationsService.send(_.get(error, 'error') || _.get(error, 'message') || `The ${direction} did not start`, 'error')
        } finally {
          this.starting = false
        }
      }
    }
  }
</script>

<style lang="scss" scoped>
.sync-runs {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-4);
  padding: var(--cms-space-4);

  h2, h3, p, ul { margin: 0; }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--cms-space-3) var(--cms-space-6);
  }

  .head-text {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-1);
    flex: 1 1 420px;
    min-width: 0;
  }

  .intro { max-width: 70ch; }

  // the resources a run covers, as they are chosen in the Sync settings
  .chosen {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cms-space-2);
    margin-block-start: var(--cms-space-1);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-1);
    padding: 0;
    list-style: none;
  }

  .chip {
    padding: 2px var(--cms-space-3);
    border: 1px solid var(--cms-border);
    border-radius: var(--cms-radius-pill);
    background: var(--cms-surface-2);
    font-size: var(--cms-fs-sm);
    font-weight: var(--cms-fw-medium);
    &.is-pending { color: var(--cms-text-muted); border-style: dashed; }
    &.is-running { background: var(--cms-primary-soft); border-color: var(--cms-primary); color: var(--cms-on-primary-soft); }
    &.is-done { background: var(--cms-success-soft); border-color: var(--cms-success); color: var(--cms-success); }
    &.is-error { background: var(--cms-error-soft); border-color: var(--cms-error); color: var(--cms-error); }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cms-space-2);
  }

  .running {
    padding: var(--cms-space-2) var(--cms-space-3);
    border-radius: var(--cms-radius-md);
    background: var(--cms-primary-soft);
    color: var(--cms-on-primary-soft);
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--cms-space-3);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-2);
    min-width: 0;
    padding: var(--cms-space-3) var(--cms-space-4);
    border-radius: var(--cms-radius-md);
    background: var(--cms-surface-2);
  }

  .run {
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-2);
  }

  .results, .schedule {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--cms-space-2);
  }

  // a dot for the outcome: green when it is done, red when it failed
  .result {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: var(--cms-space-2);
    align-items: baseline;
    &::before {
      content: '';
      grid-row: 1 / span 2;
      align-self: start;
      width: 8px;
      height: 8px;
      margin-block-start: 0.5em;
      border-radius: var(--cms-radius-pill);
      background: var(--cms-success);
    }
    .resource { font-weight: var(--cms-fw-semibold); overflow-wrap: anywhere; }
    .outcome { grid-column: 2; font-size: var(--cms-fs-sm); color: var(--cms-text-muted); overflow-wrap: anywhere; }
    &.is-error {
      &::before { background: var(--cms-error); }
      .outcome { color: var(--cms-error); }
    }
  }

  .scheduled {
    display: grid;
    grid-template-columns: 4.5ch auto;
    align-items: baseline;
    gap: 2px var(--cms-space-3);
    .next { grid-column: 2; }
  }
}
</style>
