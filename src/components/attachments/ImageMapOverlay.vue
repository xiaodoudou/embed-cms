<template>
  <!-- the areas of an image map over its picture: a view only, in fractions of the picture (the box it is laid in has the shape of the picture) -->
  <svg class="map-overlay-view" :viewBox="`0 0 ${WIDTH} ${round(height)}`" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <template v-for="area in areas" :key="area.id">
      <rect v-if="area.shape === 'rect'" :x="round(area.coords[0] * WIDTH)" :y="round(area.coords[1] * height)" :width="round((area.coords[2] - area.coords[0]) * WIDTH)" :height="round((area.coords[3] - area.coords[1]) * height)" />
      <circle v-else-if="area.shape === 'circle'" :cx="round(area.coords[0] * WIDTH)" :cy="round(area.coords[1] * height)" :r="round(area.coords[2] * WIDTH)" />
      <polygon v-else :points="svgPoints(area, WIDTH, height)" />
    </template>
  </svg>
</template>

<script>
  import _ from 'lodash'
  import { svgPoints } from '@u/imageMap'

  // the unit the shapes are drawn in; the height follows from the shape of the picture, so that a circle stays round
  const WIDTH = 1000

  export default {
    props: {
      areas: { type: Array, default: () => [] },
      // the picture's width over its height
      aspect: { type: Number, default: 1.6 }
    },
    data () {
      return { WIDTH }
    },
    computed: {
      /** @returns {number} the height of the drawing, in the unit of its width */
      height () {
        return WIDTH / (this.aspect > 0 ? this.aspect : 1.6)
      }
    },
    methods: {
      svgPoints,
      /**
       * @param {number} value
       * @returns {number} the value to two decimals (what a drawing needs, and no noise of floating point in the page)
       */
      round (value) {
        return _.round(value, 2)
      }
    }
  }
</script>

<style lang="scss">
.map-overlay-view {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  rect, circle, polygon {
    fill: var(--cms-primary);
    fill-opacity: 0.3;
    stroke: var(--cms-on-image-control);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
}
</style>
