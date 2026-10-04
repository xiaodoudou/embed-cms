export default {
  data () {
    return {
      key: crypto.randomUUID(),
      dragOptions: {
        animation: 200,
        // no group here: each list names its own (the key of its component), so that nothing can be dragged from one field into another.
        // A group in these options came after the list's own and won over it, which made every image and file field one group.
        disabled: false,
        ghostClass: 'ghost',
        // a finger has to rest 150 ms on the handle before it drags (a swipe on it scrolls the page); a mouse drags at once: with
        // the delay on the mouse too, a quick press-and-move, which is how anyone drags, started nothing and looked like a broken list
        delay: 150,
        delayOnTouchOnly: true,
        touchStartThreshold: 10
      }
    }
  },
  methods: {
    /**
     * @param {Object} elem an attachment
     * @returns {string} a key for v-for
     */
    getKey (elem) {
      return `${elem._filename}-${elem._id || elem._createdAt || elem._md5sum || elem._size}`
    }
  }
}
