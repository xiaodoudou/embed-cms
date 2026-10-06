<template>
  <div class="cms-page design-system">
    <div class="cms-page-inner">
      <header class="cms-page-header">
        <div>
          <h1 class="cms-page-title">Design system</h1>
          <p class="cms-page-subtitle">Living reference for buttons, chips, dialogs, toasts and dropdowns. Open with <code>#/?id=design-system</code>.</p>
        </div>
      </header>

      <section class="cms-card ds-section" aria-labelledby="ds-buttons">
        <h2 id="ds-buttons">Buttons</h2>
        <table class="ds-table">
          <thead>
            <tr>
              <th scope="col">Variant</th>
              <th scope="col">Default</th>
              <th scope="col">Compact</th>
              <th scope="col">Icon + label</th>
              <th scope="col">Icon only</th>
              <th scope="col">Loading</th>
              <th scope="col">Disabled</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="variant in variants" :key="variant.name">
              <th scope="row">{{ variant.name }}<small>{{ variant.usage }}</small></th>
              <td><v-btn v-bind="variant.props">Label</v-btn></td>
              <td><v-btn v-bind="variant.props" size="small">Label</v-btn></td>
              <td><v-btn v-bind="variant.props"><v-icon icon="$contentSave" size="small" />Save</v-btn></td>
              <td><v-btn v-bind="variant.props" icon :aria-label="variant.name + ' icon button'"><v-icon icon="$trashCanOutline" size="small" /></v-btn></td>
              <td><v-btn v-bind="variant.props" loading>Loading</v-btn></td>
              <td><v-btn v-bind="variant.props" disabled>Disabled</v-btn></td>
            </tr>
          </tbody>
        </table>
        <p class="ds-note">Placement: the primary action sits on the right of footers and action bars, cancel to its left; icon-only actions are grouped away from the main actions.</p>
      </section>

      <section class="cms-card ds-section" aria-labelledby="ds-toggles">
        <h2 id="ds-toggles">Toggles, chips and tags</h2>
        <div class="ds-row">
          <div class="toggle-view-mode" role="group" aria-label="View">
            <button type="button" class="toggle-mode-btn" :class="{selected: mode === 'a'}" :aria-pressed="mode === 'a' ? 'true' : 'false'" aria-label="Edit mode" @click="mode = 'a'"><v-icon size="small" icon="$noteEditOutline" /></button>
            <button type="button" class="toggle-mode-btn" :class="{selected: mode === 'b'}" :aria-pressed="mode === 'b' ? 'true' : 'false'" aria-label="Select mode" @click="mode = 'b'"><v-icon size="small" icon="$formatListChecks" /></button>
          </div>
          <button type="button" class="filter-chip" :class="{active: chip}" :aria-pressed="chip ? 'true' : 'false'" @click="chip = !chip">Updated by me</button>
          <v-chip closable :close-label="'Remove articles'">articles</v-chip>
          <v-chip closable close-label="Remove admin settings">admin settings</v-chip>
          <v-chip variant="outlined">outlined</v-chip>
        </div>
      </section>

      <section class="cms-card ds-section" aria-labelledby="ds-feedback">
        <h2 id="ds-feedback">Dialogs and toasts</h2>
        <div class="ds-row">
          <v-btn variant="outlined" @click="showToast('success')">Success toast</v-btn>
          <v-btn variant="outlined" @click="showToast('info')">Info toast</v-btn>
          <v-btn variant="outlined" @click="showToast('warn')">Warning toast</v-btn>
          <v-btn variant="outlined" color="error" @click="showToast('error')">Error toast</v-btn>
          <v-btn variant="outlined" @click="openDialog('info')">Info dialog</v-btn>
          <v-btn variant="outlined" @click="openDialog('destructive')">Destructive dialog</v-btn>
        </div>
      </section>

      <section class="cms-card ds-section" aria-labelledby="ds-forms">
        <h2 id="ds-forms">Form controls</h2>
        <p class="ds-note">One state system for every control: editable (field surface, strong border, hover darkens it, focus adds the accent border and ring), read-only (tinted, no border, a lock after the label, still copyable), disabled (page colour, dashed border, muted text, no icon), error (red border, icon and message).</p>
        <div class="ds-forms">
          <div v-for="state in formStates" :key="state.name" class="ds-form-col">
            <h3>{{ state.name }}<small>{{ state.hint }}</small></h3>
            <field-label :schema="{ label: 'Name', readonly: state.readonly, disabled: state.disabled }" />
            <v-text-field
              v-bind="fieldProps(state)" persistent-placeholder aria-label="Text"
              :placeholder="state.name === 'Editable' ? 'Placeholder' : ''" :model-value="state.empty ? '' : 'Nordic oak chair'"
            />
            <v-textarea v-bind="fieldProps(state)" :rows="2" no-resize model-value="A sturdy chair with a solid oak frame." aria-label="Text area" />
            <v-autocomplete v-bind="fieldProps(state)" :items="['Chairs', 'Tables']" model-value="Chairs" menu-icon="$chevronDown" aria-label="Select" />
            <v-autocomplete v-bind="fieldProps(state)" :items="['new', 'sale', 'oak']" :model-value="['new', 'oak']" multiple chips closable-chips menu-icon="$chevronDown" aria-label="Multiple select" />
            <div class="date-picker-wrapper" :class="{'is-readonly': state.readonly, 'is-disabled': state.disabled}">
              <div class="date-row">
                <div class="date-control">
                  <date-picker
                    class="date-picker" :model-value="1772668800000" model-type="timestamp" :formats="{ input: formatDate }" :text-input="true" :clearable="!state.readonly && !state.disabled"
                    :readonly="state.readonly" :disabled="state.disabled" placeholder="YYYY-MM-DD" :time-config="{ enableTimePicker: false }"
                  />
                </div>
              </div>
            </div>
            <custom-checkbox :model="{flag: true}" :schema="{label: 'Published', model: 'flag', readonly: state.readonly, disabled: state.disabled, options: {}}" :disabled="state.disabled" />
          </div>
        </div>
      </section>

      <section class="cms-card ds-section" aria-labelledby="ds-links">
        <h2 id="ds-links">Links</h2>
        <p class="ds-note">One link style, in the page, in a table and in a plugin: the primary colour, an underline on hover and on keyboard focus, a darker shade once visited. A link that leaves the admin gets an arrow.</p>
        <div class="ds-row">
          <a class="cms-link" href="#/?id=design-system">A link to a page of the admin</a>
          <a class="cms-link is-muted" href="#/?id=design-system">A secondary link</a>
          <a class="cms-link" href="https://example.com" target="_blank" rel="noopener">A link to another site</a>
        </div>
        <table class="cms-datatable is-hover">
          <tbody>
            <tr><td><a class="cms-link" href="#/?id=design-system">Winter ferry timetable</a></td><td>Articles</td><td class="cms-text-muted">1 hour ago</td></tr>
            <tr><td><a class="cms-link" href="#/?id=design-system">Letters to the editor</a></td><td>Articles</td><td class="cms-text-muted">3 hours ago</td></tr>
          </tbody>
        </table>
      </section>

      <section class="cms-card ds-section" aria-labelledby="ds-dropdown">
        <h2 id="ds-dropdown">Dropdown</h2>
        <div class="ds-row ds-dropdown">
          <v-select v-model="option" :items="['Alpha', 'Beta', 'Gamma']" placeholder="Choose one" aria-label="Single select" hide-details="auto" />
          <v-autocomplete v-model="options" :items="['articles', 'authors', 'comments', 'groups', 'users', 'settings', 'admin settings', 'config']" multiple chips closable-chips aria-label="Multiple select" hide-details="auto" />
        </div>
      </section>

      <kit-reference />
      <public-tokens />
    </div>
  </div>
</template>

<script>
  import NotificationsService from '@s/NotificationsService'
  import KitReference from './KitReference.vue'
  import PublicTokens from './PublicTokens.vue'

  export default {
    components: { KitReference, PublicTokens },
    data () {
      return {
        mode: 'a',
        chip: false,
        option: null,
        formStates: [
          { name: 'Editable', hint: 'hover darkens the border' },
          { name: 'Focus', hint: 'accent border and ring', focused: true },
          { name: 'Error', hint: 'red border, icon, message', error: true },
          { name: 'Read-only', hint: 'tinted, lock, copyable', readonly: true },
          { name: 'Disabled', hint: 'dashed, muted, no icon', disabled: true }
        ],
        options: ['articles', 'authors', 'admin settings', 'config', 'groups'],
        variants: [
          { name: 'Primary', usage: 'one main action per view', props: {} },
          { name: 'Secondary', usage: 'cancel, discard, supporting', props: { variant: 'outlined' } },
          { name: 'Tertiary', usage: 'low emphasis, toolbar icons', props: { variant: 'text' } },
          { name: 'Destructive', usage: 'final destructive confirmation', props: { color: 'error' } },
          { name: 'Destructive outline', usage: 'entry point, e.g. Delete', props: { variant: 'outlined', color: 'error' } }
        ]
      }
    },
    methods: {
      /**
       * @param {{focused?: boolean, readonly?: boolean, disabled?: boolean}} state
       * @returns {Object} the props of a sample field
       */
      fieldProps (state) {
        return {
          variant: 'solo-filled', flat: true, rounded: true, density: 'compact', 'hide-details': 'auto',
          focused: !!state.focused, readonly: !!state.readonly, disabled: !!state.disabled,
          'error-messages': state.error ? ['This field is required'] : []
        }
      },
      /**
       * @param {Date|string|number} date
       * @returns {string} YYYY-MM-DD
       */
      formatDate (date) {
        return new Date(date).toISOString().slice(0, 10)
      },
      /** @param {string} type success, info, warn or error */
      showToast (type) {
        const messages = { success: 'Region A saved', info: 'Import started...', warn: '2 fields need attention', error: 'Save failed: network error' }
        NotificationsService.send(messages[type], type, type === 'error' ? { actionLabel: 'Retry', action: () => {} } : { detail: 'mukx1234' })
      },
      /** @param {string} type destructive, or anything else */
      openDialog (type) {
        window.DialogService.show({
          event: 'designSystem',
          destructive: type === 'destructive',
          title: type === 'destructive' ? 'Delete "Region A"?' : 'Sync record',
          message: type === 'destructive' ? 'Are you sure you want to delete this record? This cannot be undone.' : 'This is an informational dialog.',
          confirm: type === 'destructive' ? 'Delete' : 'OK',
          cancel: 'Cancel',
          callback: () => {}
        })
      }
    }
  }
</script>

<style lang="scss" scoped>
.design-system {
  h2 {
    margin: 0 0 var(--cms-space-3);
    font-size: var(--cms-fs-lg);
    font-weight: var(--cms-fw-semibold);
  }
  code {
    padding: 1px var(--cms-space-1);
    border-radius: var(--cms-radius-xs);
    background: var(--cms-code-bg);
    font-family: var(--cms-font-mono);
  }
}
.ds-table {
  width: 100%;
  border-collapse: collapse;
  th,
  td {
    padding: var(--cms-space-3) var(--cms-space-2);
    border-bottom: 1px solid var(--cms-border);
    text-align: left;
    vertical-align: middle;
    font-weight: var(--cms-fw-medium);
    small {
      display: block;
      color: var(--cms-text-muted);
      font-weight: var(--cms-fw-regular);
    }
  }
  thead th {
    font-size: var(--cms-fs-sm);
    color: var(--cms-text-muted);
  }
}
.ds-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cms-space-3);
}
.ds-forms {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--cms-space-5);
  margin-top: var(--cms-space-4);
}
.ds-form-col {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-4);
  align-items: stretch;
  > * {
    flex: 0 0 auto;
  }
  h3 {
    margin: 0;
    font-size: var(--cms-fs-base);
    font-weight: var(--cms-fw-semibold);
    small {
      display: block;
      color: var(--cms-text-muted);
      font-weight: var(--cms-fw-regular);
    }
  }
}
.ds-dropdown > * {
  flex: 1 1 260px;
}
.ds-note {
  margin: var(--cms-space-3) 0 0;
  color: var(--cms-text-muted);
}
@media (max-width: 767.98px) {
  .ds-table {
    display: block;
    overflow-x: auto;
  }
}
</style>
