<template>
  <span class="brand-logo" :class="{'on-dark': onDark}" role="img" :aria-label="name">
    <svg class="brand-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" class="mark-bg" />
      <path d="M22 10H10V22H22M10 16H18" class="mark-line" />
      <circle cx="22" cy="10" r="2.6" class="mark-node" />
      <circle cx="18" cy="16" r="2.6" class="mark-node" />
      <circle cx="22" cy="22" r="2.6" class="mark-node" />
    </svg>
    <span v-if="!markOnly" class="brand-word" aria-hidden="true">Embed<span class="brand-word-light"> CMS</span></span>
  </span>
</template>

<script setup>
  defineProps({
    markOnly: { type: Boolean, default: false },
    onDark: { type: Boolean, default: false },
    name: { type: String, default: 'Embed CMS' }
  })
</script>

<style lang="scss" scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
  gap: var(--cms-space-2);
  color: var(--cms-text);
  line-height: 1;
  user-select: none;
}
.mark-bg {
  fill: var(--cms-primary);
}
.on-dark {
  color: var(--cms-chrome-text);
  .mark-bg {
    fill: var(--cms-brand);
  }
  .mark-line {
    stroke: var(--cms-brand-mark);
  }
  .mark-node {
    fill: var(--cms-brand-mark);
  }
  .brand-word-light {
    color: var(--cms-chrome-muted);
  }
}
.mark-line {
  fill: none;
  stroke: var(--cms-on-primary);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mark-node {
  fill: var(--cms-on-primary);
}
.brand-word {
  font-size: var(--cms-fs-lg);
  font-weight: var(--cms-fw-bold);
  letter-spacing: -0.01em;
}
.brand-word-light {
  font-weight: var(--cms-fw-regular);
  color: var(--cms-text-muted);
}
</style>
