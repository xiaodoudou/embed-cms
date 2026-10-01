# Smart cropping

> **Status: face and object detection are switched off in this release.** The model loading in `lib/util/smartcrop.js`
> is commented out and the TensorFlow packages are not dependencies, so every smart crop falls back to a **centre crop**
> and logs an error ([BUGS.md](BUGS.md#plugins)). The API below works and returns images of the size you ask for; it
> just doesn't look for faces yet. This page describes the interface, so that code written against it keeps working
> when detection comes back.

## The idea

A plain resize to a different aspect ratio has to cut something off, and the centre is a guess. A thumbnail of a portrait
taken off-centre loses the face. Smart cropping was built to look for faces and objects first (with the BlazeFace and
COCO-SSD models of TensorFlow.js) and keep them in the frame: every person when there are several, the face alone for an
avatar, the most confident object when there are no people, and the centre when nothing is found.

## Asking for a smart crop

Over REST, add `smart=true` to an image download that has a `resize`:

```
/api/articles/<id>/attachments/<aid>?resize=400x300&smart=true
```

Only `resize` and `smart` are read from the URL. The finer options exist in the JavaScript API:

```js
const articles = cms.api()('articles')

const avatar = await articles.findAttachment(articleId, attachmentId, {
  resize: '100x100',
  smart: true,
  faceOnly: true,   // a square around the face
  facePadding: 20   // pixels around it (default 10)
})
avatar.stream.pipe(res)
```

| Option | Default | Meaning |
|---|---|---|
| `resize` | required | `WIDTHxHEIGHT`, `WIDTHxauto` or `autoxHEIGHT`. |
| `smart` | `false` | Use smart cropping. Over REST any value turns it on, `smart=false` included. |
| `faceOnly` | `false` | Crop around the face only. JavaScript API. |
| `facePadding` | `10` | Space around the face, in pixels. JavaScript API. |
| `objectDetection` | `false` | Prefer detected objects. JavaScript API. |

To crop an image you have in memory, without storing it, use `applyCrop`:

```js
const fs = require('fs/promises')

const result = await cms.api()('articles').applyCrop(await fs.readFile('./portrait.jpg'), '300x300', { faceOnly: true })
await fs.writeFile('./thumb.jpg', result.buffer)
// result also has mimeType, contentLength, cropResult { x, y, width, height }, originalSize, targetSize,
// and fallback: true when the centre crop was used
```

## Caching

Smart crops are cached next to the original file, under `<aid>-smart-default-<size>`, `<aid>-smart-faceonly-<size>` or
`<aid>-smart-objects-<size>`, and removed when the attachment or its record changes or goes. `facePadding` is not part of
the key, and the REST route keeps a second cache that doesn't know about `smart`, so a smart and a plain request of the same
size can get each other's image ([BUGS.md](BUGS.md#rest-api)). Use different sizes for the two if that matters to you.

## Configuration

`"smartCrop": true` in `cms.json` asks the CMS to prepare the detection models at start-up. With detection switched off it
has no effect, and smart crops are served whether it is set or not.

## Tests

`test/smart-cropping.test.js` (part of `npm test`) crops `test/man.jpg` and writes the results to `test/smartCropAssets/`,
which git ignores. `test/unit/imageOptimization.unit.test.js` covers the fallback.
