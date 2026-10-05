// the class of the page while one of the lists is being dragged: no text is selected by the drag, and the hand stays closed
const DRAGGING_CLASS = 'cms-dragging'

export default {
  data () {
    return {
      key: crypto.randomUUID(),
      dragOptions: {
        // the others slide aside to make room, on a computer; on a touch screen they do not: the slide measures every item of the list at each swap and costs a phone a fifth of the
        // drop (130ms of 174ms at four times slower than a computer without it)
        animation: typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 0 : 150,
        // no group here: each list names its own (the key of its component), so that nothing can be dragged from one field into another.
        // A group in these options came after the list's own and won over it, which made every image and file field one group.
        disabled: false,
        ghostClass: 'ghost',
        // a finger drags at once, as a mouse does: the handle has `touch-action: none`, so a swipe on it never scrolls the page and there is nothing to wait for. A delay of
        // 150 ms (and a move of 10px that cancelled it) made a quick drag, a natural one and a finger that drifts all start nothing: only a held finger worked
        delay: 0,
        touchStartThreshold: 3,
        fallbackTolerance: 3
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
      // a field with the cursor in it is folded away with its block when the drag begins, and the page jumps to the end of the list with it (the block is not moved): the cursor
      // (and the keyboard on a phone) goes first
      const active = document.activeElement
      if (active && active !== document.body && active.matches('input, textarea, [contenteditable]')) {
        active.blur()
      }
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
