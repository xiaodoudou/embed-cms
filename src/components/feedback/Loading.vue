<template>
  <div class="showbox active" role="status" aria-live="polite" aria-busy="true">
    <div class="loader">
      <span class="cms-visually-hidden">{{ $filters.translate('TL_LOADING') }}</span>
      <svg class="circular" viewBox="25 25 50 50"><circle class="path" cx="50" cy="50" r="20" fill="none" stroke-width="2" stroke-miterlimit="10" /></svg>
    </div>
  </div>
</template>
