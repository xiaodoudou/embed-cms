// a resource whose file fields can hold files that no longer fit their field: the field became localised or stopped being so,
// or its maxCount was lowered after the files were uploaded (the admin shows such files as abnormal)
module.exports = {
  displayname: 'Media',
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', localised: false, unique: true },
    // a value per language: a file of it is named photo.enUS, photo.zhCN
    { field: 'photo', input: 'image' },
    // one value for all the languages: a file of it is named doc
    { field: 'doc', input: 'file', localised: false },
    { field: 'single', input: 'file', localised: false, options: { maxCount: 1 } }
  ]
}
