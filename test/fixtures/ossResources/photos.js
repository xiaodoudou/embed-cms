// Resource of the OSS tests: fields that keep their files in Alibaba Cloud OSS next to fields that keep them on disk.
module.exports = {
  displayname: 'Photos',
  schema: [
    { field: 'title', input: 'string', localised: false },
    // a file field on OSS, with the resource and the record in the object key
    { field: 'document', input: 'file', localised: false, options: { method: 'oss', oss: { accessKeyId: 'test-key', path: 'uploads/%{resource}/%{_id}', filename: 'file-%{filename}' } } },
    // an image field on OSS that takes one picture: a new upload replaces the one before
    { field: 'picture', input: 'image', localised: false, options: { maxCount: 1, method: 'oss', oss: { accessKeyId: 'test-key', path: 'pictures/%{resource}', filename: '%{filename}' } } },
    // a plain file field: its files stay in the blob folder of the resource
    { field: 'local', input: 'file', localised: false },
    // OSS options without method: 'oss' mean nothing, the files stay on disk
    { field: 'configured', input: 'file', localised: false, options: { method: 'disk', oss: { accessKeyId: 'test-key', path: 'never', filename: '%{filename}' } } }
  ],
  type: 'normal'
}
