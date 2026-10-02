<template>
  <section class="cms-card ds-section kit-reference" aria-labelledby="ds-kit">
    <h2 id="ds-kit">Plugin UI kit</h2>
    <p class="ds-note">
      CSS only, plain HTML, nothing but tokens: what a plugin uses when it does not want a framework. Every example below is the HTML written in
      <code>docs/extending/PLUGIN_UI_KIT.md</code>, drawn by the kit.
    </p>

    <h3>Text and links</h3>
    <div class="kit-demo cms-stack">
      <h4 class="cms-h1">Heading 1</h4>
      <h4 class="cms-h2">Heading 2</h4>
      <h4 class="cms-h3">Heading 3</h4>
      <h4 class="cms-h4">Heading 4</h4>
      <p class="cms-text">Body text with <code class="cms-code">inline code</code>, <kbd class="cms-kbd">Ctrl K</kbd>, <a class="cms-link" href="#/?id=design-system">a link</a>, <a class="cms-link is-muted" href="#/?id=design-system">a muted link</a> and <a class="cms-link" href="https://example.com" target="_blank" rel="noopener">an external link</a>.</p>
      <p class="cms-text cms-text-sm cms-text-muted">Small, muted text. <span class="cms-text-success">Success</span>, <span class="cms-text-warning">warning</span>, <span class="cms-text-error">error</span>.</p>
    </div>

    <h3>Layout</h3>
    <div class="kit-demo cms-stack">
      <div class="cms-row is-between">
        <span class="cms-text">A row, pushed to both ends</span>
        <span class="cms-badge is-primary">cms-row is-between</span>
      </div>
      <div class="cms-grid">
        <div class="cms-col-4 cms-panel">cms-col-4</div>
        <div class="cms-col-4 cms-panel">cms-col-4</div>
        <div class="cms-col-4 cms-panel">cms-col-4</div>
        <div class="cms-col-8 cms-panel">cms-col-8</div>
        <div class="cms-col-4 cms-panel">cms-col-4</div>
      </div>
      <div class="cms-split">
        <div class="cms-split-side cms-panel">cms-split-side</div>
        <div class="cms-split-main cms-panel">cms-split-main</div>
      </div>
    </div>

    <h3>Boxes</h3>
    <div class="kit-demo cms-grid">
      <a class="cms-col-4 cms-card is-interactive cms-link-card" href="#/?id=design-system">
        <div class="cms-card-body cms-stat">
          <span class="cms-stat-label">Articles</span>
          <span class="cms-stat-value">7</span>
          <span class="cms-stat-hint">5 changed this week</span>
        </div>
      </a>
      <div class="cms-col-4 cms-card is-raised">
        <div class="cms-card-header">A card</div>
        <div class="cms-card-body cms-text">With a header, a body and a footer.</div>
        <div class="cms-card-footer"><button type="button" class="cms-btn is-sm is-tertiary">Action</button></div>
      </div>
      <div class="cms-col-4 cms-stack">
        <div class="cms-callout is-info" role="status">Information</div>
        <div class="cms-callout is-success" role="status">Success</div>
        <div class="cms-callout is-warning" role="status">Warning</div>
        <div class="cms-callout is-error" role="alert">Error</div>
      </div>
    </div>

    <h3>Tables and lists</h3>
    <div class="kit-demo cms-grid">
      <div class="cms-col-6">
        <div class="cms-datatable-scroll">
          <table class="cms-datatable is-hover is-striped">
            <thead><tr><th aria-sort="descending">Name</th><th>Status</th><th class="cms-num">Total</th></tr></thead>
            <tbody>
              <tr><td><a class="cms-link" href="#/?id=design-system">Articles</a></td><td><span class="cms-badge is-success">published</span></td><td class="cms-num">7</td></tr>
              <tr><td><a class="cms-link" href="#/?id=design-system">Authors</a></td><td><span class="cms-badge is-warning">draft</span></td><td class="cms-num">4</td></tr>
              <tr><td><a class="cms-link" href="#/?id=design-system">Comments</a></td><td><span class="cms-badge">archived</span></td><td class="cms-num">120</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="cms-col-6">
        <ul class="cms-list is-striped">
          <li class="cms-list-item is-selected">A selected row</li>
          <li class="cms-list-item">A row</li>
          <li class="cms-list-item">Another row</li>
        </ul>
      </div>
    </div>

    <h3>Forms</h3>
    <div class="kit-demo cms-grid">
      <div class="cms-col-3 cms-field">
        <label class="cms-label" for="kit-editable">Editable</label>
        <input id="kit-editable" class="cms-input" value="Nordic oak chair">
        <span class="cms-hint">A hint under the control</span>
      </div>
      <div class="cms-col-3 cms-field">
        <label class="cms-label" for="kit-error">Error</label>
        <input id="kit-error" class="cms-input" aria-invalid="true" value="">
        <span class="cms-error">This field is required</span>
      </div>
      <div class="cms-col-3 cms-field">
        <label class="cms-label" data-state="readonly" for="kit-readonly">Read-only</label>
        <input id="kit-readonly" class="cms-input" value="Nordic oak chair" readonly>
      </div>
      <div class="cms-col-3 cms-field">
        <label class="cms-label" data-state="disabled" for="kit-disabled">Disabled</label>
        <input id="kit-disabled" class="cms-input" value="Nordic oak chair" disabled>
      </div>
      <div class="cms-col-6 cms-field">
        <label class="cms-label" for="kit-text">Text area</label>
        <textarea id="kit-text" class="cms-textarea" rows="2">A sturdy chair with a solid oak frame.</textarea>
      </div>
      <div class="cms-col-3 cms-field">
        <label class="cms-label" for="kit-select">Select</label>
        <select id="kit-select" class="cms-select"><option>Chairs</option><option>Tables</option></select>
      </div>
      <div class="cms-col-3 cms-field">
        <span class="cms-label">Switch</span>
        <input v-model="switched" type="checkbox" class="cms-switch" role="switch" aria-label="Published">
      </div>
    </div>

    <h3>Buttons and feedback</h3>
    <div class="kit-demo cms-stack">
      <div class="cms-row">
        <button type="button" class="cms-btn is-primary">Primary</button>
        <button type="button" class="cms-btn is-secondary">Secondary</button>
        <button type="button" class="cms-btn is-tertiary">Tertiary</button>
        <button type="button" class="cms-btn is-danger">Danger</button>
        <button type="button" class="cms-btn is-danger-outline">Danger outline</button>
        <button type="button" class="cms-btn is-primary" disabled>Disabled</button>
        <button type="button" class="cms-btn is-secondary is-sm">Small</button>
      </div>
      <div class="cms-row">
        <span class="cms-btn-group">
          <button type="button" class="cms-btn is-secondary">One</button>
          <button type="button" class="cms-btn is-secondary">Two</button>
          <button type="button" class="cms-btn is-secondary">Three</button>
        </span>
        <span class="cms-toggle" role="group" aria-label="Choose one">
          <button v-for="(label, index) in ['A', 'B', 'C']" :key="label" type="button" :aria-pressed="picked === index ? 'true' : 'false'" :aria-label="`Option ${label}`" @click="picked = index">{{ label }}</button>
        </span>
        <span class="cms-badge">badge</span>
        <span class="cms-badge is-primary">primary</span>
        <span class="cms-badge is-success">success</span>
        <span class="cms-badge is-warning">warning</span>
        <span class="cms-badge is-error">error</span>
        <span class="cms-spinner" role="status" aria-label="Loading" />
        <span class="cms-text-sm cms-text-muted" data-tip="A short hint">hover for a hint</span>
      </div>
      <progress class="cms-progress" max="100" value="60" aria-label="Progress" />
      <div class="cms-skeleton" style="height: 24px" aria-hidden="true" />
    </div>
  </section>
</template>

<script>
  export default {
    data () {
      return { switched: true, picked: 0 }
    }
  }
</script>

<style lang="scss">
.kit-reference {
  h3 {
    margin: var(--cms-space-6) 0 var(--cms-space-3);
    font-size: var(--cms-fs-lg);
  }
  .kit-demo {
    padding: var(--cms-space-4);
    border: 1px dashed var(--cms-border-strong);
    border-radius: var(--cms-radius-md);
  }
}
</style>
