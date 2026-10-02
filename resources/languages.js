// every language-aware field type with four languages (English, Chinese, French, Thai): the language switch of the record editor
// shows the unsaved dot and the missing required fields of each language
const label = (enUS, zhCN, frFR, thTH) => ({ enUS, zhCN, frFR, thTH })

module.exports = {
  displayname: { enUS: 'Languages', zhCN: '语言' },
  group: { enUS: 'Text', zhCN: '文本' },
  locales: ['enUS', 'zhCN', 'frFR', 'thTH'],
  type: 'normal',
  schema: [
    { field: 'title', input: 'string', label: label('Title', '标题', 'Titre', 'ชื่อเรื่อง'), required: true, options: { hint: 'Required in every language. Names the record in lists' } },
    { field: 'slug', input: 'transliterate', label: label('Slug', '别名', 'Identifiant', 'สลัก'), options: { hint: 'Optional. One value per language' } },
    { field: 'summary', input: 'text', label: label('Summary', '摘要', 'Résumé', 'สรุป'), options: { hint: 'Optional. One value per language' } },
    { field: 'body', input: 'wysiwyg', label: label('Body', '正文', 'Contenu', 'เนื้อหา'), options: { hint: 'Rich text, one per language' } },
    { field: 'requiredBody', input: 'wysiwyg', label: label('Required body', '必填正文', 'Contenu obligatoire', 'เนื้อหาที่จำเป็น'), required: true, options: { hint: 'Required in every language: the switch shows where it is missing' } },
    { field: 'link', input: 'url', label: label('Link', '链接', 'Lien', 'ลิงก์'), options: { hint: 'One link per language' } },
    { field: 'tags', input: 'pillbox', label: label('Tags', '标签', 'Étiquettes', 'แท็ก'), options: { hint: 'One list of tags per language' } },
    { field: 'choice', input: 'select', label: label('Choice', '选项', 'Choix', 'ตัวเลือก'), source: ['one', 'two', 'three'], options: { hint: 'One value per language' } },
    { field: 'items', input: 'multiselect', label: label('Linked items', '关联项', 'Éléments liés', 'รายการที่เชื่อมโยง'), source: 'reference_items', options: { customLabel: '{{name}}', hint: 'One selection per language' } },
    { field: 'banner', input: 'image', label: label('Banner', '横幅', 'Bannière', 'แบนเนอร์'), options: { maxCount: 1, hint: 'One image per language' } },
    { field: 'published', input: 'checkbox', label: label('Published', '已发布', 'Publié', 'เผยแพร่แล้ว'), options: { hint: 'On or off, per language' } },
    { field: 'code', input: 'string', label: 'Code', localised: false, options: { hint: 'The same in every language' } }
  ]
}
