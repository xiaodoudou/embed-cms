import _ from 'lodash'
import { resultSize } from '@u/cropRecipe'

/**
 * @param {string} src an address or a data url
 * @returns {Promise<HTMLImageElement>} the picture, loaded (a browser draws it with its EXIF orientation applied, as the crop tool shows it)
 */
function loadImage (src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The picture could not be loaded'))
    image.src = src
  })
}

/**
 * Draws a small picture of what a crop makes of a picture, once, when the crop is applied: it is what the field shows until the picture is
 * saved (after that the API cuts the real one). The same order as the server: flipped, turned, cropped, shaped.
 * @param {string} src the picture
 * @param {Object} recipe what the crop tool gives (see utils/cropRecipe.js buildRecipe)
 * @param {number} [maxSide=360] the longest side of the small picture, in pixels
 * @returns {Promise<string>} a data url, empty when there is no canvas to draw on
 */
export async function renderPreview (src, recipe, maxSide = 360) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext && canvas.getContext('2d')
  if (!context) {
    return ''
  }
  const image = await loadImage(src)
  const turn = _.get(recipe, 'rotate', 0)
  const sideways = turn === 90 || turn === 270
  const turned = sideways ? { width: image.naturalHeight, height: image.naturalWidth } : { width: image.naturalWidth, height: image.naturalHeight }
  const kept = { left: recipe.left || 0, top: recipe.top || 0, width: recipe.width || turned.width, height: recipe.height || turned.height }
  const size = resultSize(kept, recipe.output)
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height))
  canvas.width = Math.max(1, Math.round(size.width * scale))
  canvas.height = Math.max(1, Math.round(size.height * scale))
  if (recipe.shape === 'circle') {
    context.beginPath()
    context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2, 0, 0, Math.PI * 2)
    context.clip()
  }
  // the part kept fills the canvas, then the picture is drawn flipped, then turned about its centre (the order of the server)
  context.scale(canvas.width / kept.width, canvas.height / kept.height)
  context.translate(-kept.left, -kept.top)
  context.translate(turned.width / 2, turned.height / 2)
  context.rotate(turn * Math.PI / 180)
  context.scale(recipe.flipX ? -1 : 1, recipe.flipY ? -1 : 1)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  return canvas.toDataURL(recipe.shape === 'circle' ? 'image/png' : 'image/jpeg', 0.85)
}
