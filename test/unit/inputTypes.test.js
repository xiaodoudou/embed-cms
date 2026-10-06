const { expect } = require('chai')
const { isAttachmentInput, isImageInput, ATTACHMENT_INPUTS } = require('../../lib/util/inputTypes')

// A crop image and an image map are image fields with a tool: wherever a field holds pictures or files, they count.

describe('input types that hold files (unit)', () => {
  it('counts the crop image and the image map as images, as well as image', () => {
    expect(['image', 'cropimage', 'imagemap'].map(isImageInput)).to.deep.equal([true, true, true])
    expect(['file', 'string', 'paragraph', undefined, null, 'Image'].map(isImageInput)).to.deep.equal([false, false, false, false, false, false])
  })

  it('counts files, images, crop images and image maps as attachments', () => {
    expect(['file', 'image', 'cropimage', 'imagemap'].map(isAttachmentInput)).to.deep.equal([true, true, true, true])
    expect(['string', 'paragraph', 'wysiwyg', undefined, ''].map(isAttachmentInput)).to.deep.equal([false, false, false, false, false])
    expect(ATTACHMENT_INPUTS).to.have.members(['file', 'image', 'cropimage', 'imagemap'])
  })
})
