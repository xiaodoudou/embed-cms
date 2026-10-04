// the class of the page while one of the lists is being dragged: no text is selected by the drag, and the hand stays closed
const DRAGGING_CLASS = 'cms-dragging'

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
  beforeUnmount () {
    this.onDragUnchoose()
  },
  methods: {
    /**
     * @param {Object} elem an attachment
     * @returns {string} a key for v-for
     */
    getKey (elem) {
      return `${elem._filename}-${elem._id || elem._createdAt || elem._md5sum || elem._size}`
    },
    /** The handle is pressed: the page stops selecting text for as long as the drag lasts. */
    onDragChoose () {
      document.body.classList.add(DRAGGING_CLASS)
    },
    /** The handle is let go (a click that never became a drag included). */
    onDragUnchoose () {
      document.body.classList.remove(DRAGGING_CLASS)
    },
    /**
     * The drag begins: the copy of the block that follows the pointer is a clone of its DOM, ids included, so the page would hold
     * every id of the block twice until the drop. The clone is only to be seen: it keeps none, and a block's keeps its title bar alone.
     */
    onDragStart () {
      const strip = () => {
        document.querySelectorAll('.sortable-fallback [id]').forEach((el) => el.removeAttribute('id'))
        // the copy of a block is a clone of all its forms, repainted at every move of the pointer: only its title bar is kept (the
        // library sized it as the whole block)
        document.querySelectorAll('.sortable-fallback').forEach((ghost) => {
          const body = ghost.querySelector('.item-main-wrapper')
          if (body) {
            body.remove()
            ghost.style.height = 'auto'
          }
        })
      }
      strip()
      // the copy is added to the page a moment after the event on some versions of the library
      requestAnimationFrame(strip)
    }
  }
}
