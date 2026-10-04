const { expect } = require('chai')
const { isAttachmentInput, isImageInput, ATTACHMENT_INPUTS } = require('../../lib/util/inputTypes')

// A crop image field is an image field with a crop tool: wherever a field holds pictures or files, it counts.

describe('input types that hold files (unit)', () => {
  it('counts the crop image as an image, as well as image', () => {
    expect(['image', 'cropimage'].map(isImageInput)).to.deep.equal([true, true])
    expect(['file', 'string', 'paragraph', undefined, null, 'Image'].map(isImageInput)).to.deep.equal([false, false, false, false, false, false])
  })

  it('counts files, images and crop images as attachments', () => {
    expect(['file', 'image', 'cropimage'].map(isAttachmentInput)).to.deep.equal([true, true, true])
    expect(['string', 'paragraph', 'wysiwyg', undefined, ''].map(isAttachmentInput)).to.deep.equal([false, false, false, false, false])
    expect(ATTACHMENT_INPUTS).to.have.members(['file', 'image', 'cropimage'])
  })
})
