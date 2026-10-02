<template>
  <section class="cms-card ds-section public-tokens" aria-labelledby="ds-tokens">
    <h2 id="ds-tokens">Public tokens</h2>
    <p class="ds-note">
      The tokens a plugin may rely on. They keep their names and their meaning inside a major version; every other <code>--cms-*</code> variable is private and
      free to change. Colours change with the light and the dark theme.
    </p>
    <div v-for="group in groups" :key="group.group" class="public-tokens-group">
      <h3>{{ group.group }}</h3>
      <table class="cms-datatable is-compact">
        <tbody>
          <tr v-for="[name, description] in group.tokens" :key="name">
            <td class="token-swatch">
              <span v-if="group.colour" class="swatch" :style="{ background: `var(${name})` }" />
            </td>
            <td><code class="cms-code">{{ name }}</code></td>
            <td class="cms-text-muted">{{ description }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script>
  import { PUBLIC_TOKENS } from '../../styles/publicTokens.js'

  export default {
    data () {
      return { groups: PUBLIC_TOKENS }
    }
  }
</script>

<style lang="scss">
.public-tokens {
  h3 {
    margin: var(--cms-space-5) 0 var(--cms-space-2);
    font-size: var(--cms-fs-lg);
  }
  .token-swatch {
    width: 48px;
  }
  .swatch {
    display: block;
    width: 32px;
    height: 20px;
    border: 1px solid var(--cms-border-strong);
    border-radius: var(--cms-radius-sm);
  }
}
</style>
