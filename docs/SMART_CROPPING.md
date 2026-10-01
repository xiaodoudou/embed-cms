# Smart cropping

A resize to another aspect ratio has to cut something off. A plain resize cuts around the centre, which loses whatever
isn't there: the face in a portrait taken off-centre, the product at the edge of a shot. Smart cropping keeps the most
interesting part of the picture instead.

It uses the *attention* strategy of [sharp](https://sharp.pixelplumbing.com/api-resize), the image library embed-cms
already uses for every resize. It looks for skin tones, saturated colours and fine detail, and frames the crop around
them. There is nothing to install or configure, no model to load, and nothing leaves the server.

## Asking for a smart crop

Over REST, add `smart=true` to an image download that has a `resize`:

```
/api/articles/<id>/attachments/<aid>?resize=400x300&smart=true
```

`smart=false`, `smart=0` or an empty value give a plain resize. Without `resize`, `smart` does nothing.

From code, the same option on `findAttachment`:

```js
const articles = cms.api()('articles')

const thumb = await articles.findAttachment(articleId, attachmentId, { resize: '400x300', smart: true })
thumb.stream.pipe(res)
```

To crop an image you have in memory, without storing it, use `applyCrop`:

```js
const fs = require('fs/promises')

const result = await cms.api()('articles').applyCrop(await fs.readFile('./portrait.jpg'), '300x300')
await fs.writeFile('./thumb.jpg', result.buffer)
// result.cropResult is the part of the original that was kept: { x, y, width, height }, in pixels of the original
// result also has mimeType, contentLength, originalSize and targetSize
```

The size is `WIDTHxHEIGHT`, `WIDTHxauto` or `autoxHEIGHT` (`auto` keeps the aspect ratio, so nothing needs cropping). The
output keeps the format of the original. JPEG, PNG and GIF can be smart cropped.

A file uploaded with `smart: true` and a `resize` (the `createAttachment` options) is stored already cropped.

## Caching

Smart crops are cached next to the original file, under `<aid>-smart-<size>`, and plain resizes under `<aid>-<size>`,
so the two never get each other's image. The cached copies are removed when the attachment or its record changes or goes.

## What to expect

The attention strategy is a heuristic, not face recognition. It does well on portraits, products and most photos with a
clear subject. On a busy picture with several subjects, or a low-contrast one, it may pick a different region than a
person would. For a picture where the framing matters, set the crop by hand in the admin's crop tool, served as
`/attachments/:aid/cropped` (see [API.md](API.md#attachments)).

## Tests

`test/unit/smartcrop.unit.test.js` checks that the crop moves to a colourful subject near the edge of a picture, rather
than staying in the centre, and checks the sizes. `test/smart-cropping.test.js` (part of `npm test`) checks that an image
cropped on upload and on download comes out the same size.
