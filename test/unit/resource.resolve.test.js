const { expect } = require('chai')
const { startApp } = require('../helpers/app')

// cms.api()('pages', 'tags'): the records come with the records their relations point to, instead of ids
describe('resource API: resolving relations (unit)', () => {
  describe('with blocks', () => {
    let A, api, red, green
    const page = (slug, extra) => api('pages').create({ slug, ...extra })

    before(async () => {
      A = await startApp({ resources: './test/fixtures/syncResources', disableJwtLogin: true })
      api = A.cms.api()
      red = await api('tags').create({ name: 'red' })
      green = await api('tags').create({ name: 'green' })
    })
    after(() => A.close())

    it('resolves a select, in list, find by id, find by query, create and update', async () => {
      const made = await api('pages', 'tags').create({ slug: 'one', topic: red._id })
      expect(made.topic).to.include({ _id: red._id, name: 'red' })
      expect((await api('pages', 'tags').find(made._id)).topic).to.include({ name: 'red' })
      expect((await api('pages', 'tags').find({ slug: 'one' })).topic).to.include({ name: 'red' })
      expect((await api('pages', 'tags').list({ slug: 'one' }))[0].topic).to.include({ name: 'red' })
      const updated = await api('pages', 'tags').update(made._id, { topic: green._id })
      expect(updated.topic).to.include({ name: 'green' })
      // the stored record keeps the id
      expect((await api('pages').find(made._id)).topic).to.equal(green._id)
    })

    it('leaves the ids when the API is asked for no resource, or for another one', async () => {
      const made = await page('plain', { topic: red._id })
      expect((await api('pages').find(made._id)).topic).to.equal(red._id)
      expect((await api('pages', 'pages').find(made._id)).topic).to.equal(red._id)
    })

    it('resolves the select and the multiselect of a block, and of a block inside a block', async () => {
      const made = await page('blocks', {
        content: [
          { _type: 'block_rel', title: 'top', tag: red._id, tags: [green._id, red._id] },
          { _type: 'block_group', label: 'group', children: [{ _type: 'block_rel', title: 'nested', tag: green._id, tags: [red._id] }] }
        ]
      })
      const found = await api('pages', 'tags').find(made._id)
      expect(found.content[0].tag).to.include({ name: 'red' })
      expect(found.content[0].tags.map(tag => tag.name)).to.deep.equal(['green', 'red'])
      expect(found.content[1].children[0].tag).to.include({ name: 'green' })
      expect(found.content[1].children[0].tags.map(tag => tag.name)).to.deep.equal(['red'])
      expect(found.content[0].title).to.equal('top')
    })

    it('answers null for an id no record has, and leaves a relation that is not set', async () => {
      const made = await page('gone', { topic: 'musxxxxxxxxxxxxxxxxxxxxx', content: [{ _type: 'block_rel', title: 'no tag', tags: ['musxxxxxxxxxxxxxxxxxxxxx', red._id] }] })
      const found = await api('pages', 'tags').find(made._id)
      expect(found.topic).to.equal(null)
      expect(found.content[0]).to.not.have.property('tag')
      expect(found.content[0].tags[0]).to.equal(null)
      expect(found.content[0].tags[1]).to.include({ name: 'red' })
    })

    it('gives each record its own copy of the related record', async () => {
      await page('copy-a', { topic: red._id })
      await page('copy-b', { topic: red._id })
      const [a, b] = await api('pages', 'tags').list({ slug: { $in: ['copy-a', 'copy-b'] } })
      a.topic.name = 'changed by a caller'
      expect(b.topic.name).to.equal('red')
      expect((await api('tags').find(red._id)).name).to.equal('red')
    })
  })

  describe('with languages, and relations of the related records', () => {
    let A, api, article, other, author
    before(async () => {
      A = await startApp({ disableJwtLogin: true })
      api = A.cms.api()
      article = await api('articles').create({ string: { enUS: 'An article', zhCN: '一篇文章' } })
      other = await api('articles').create({ string: { enUS: 'Another', zhCN: '另一篇' } })
      author = await api('authors').create({ article: { enUS: article._id, zhCN: other._id }, name: { enUS: 'Ann', zhCN: '安' } })
    })
    after(() => A.close())

    it('resolves a value per language, language by language', async () => {
      const found = await api('authors', 'articles').find(author._id)
      expect(found.article.enUS).to.include({ _id: article._id })
      expect(found.article.enUS.string).to.deep.equal({ enUS: 'An article', zhCN: '一篇文章' })
      expect(found.article.zhCN).to.include({ _id: other._id })
    })

    it('resolves the relations of the related records too, when their resource is asked for', async () => {
      const comment = await api('comments').create({ author: author._id, title: { enUS: 'Nice' } })
      const withAuthor = await api('comments', 'authors').find(comment._id)
      expect(withAuthor.author).to.include({ _id: author._id })
      expect(withAuthor.author.article.enUS).to.equal(article._id)
      const deeper = await api('comments', 'authors', 'articles').find(comment._id)
      expect(deeper.author.article.enUS).to.include({ _id: article._id })
    })
  })
})
