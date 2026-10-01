import { describe, it, expect } from 'vitest'
import { buildPageTitle, PRODUCT_NAME } from '@u/pageTitle'

// The tab says where you are: the record, the resource, then the site.
describe('buildPageTitle', () => {
  it('goes from the record to the site', () => {
    expect(buildPageTitle({ record: 'Gamma', resource: 'Reference items', site: 'Newsroom' })).toBe('Gamma · Reference items · Newsroom')
  })

  it('leaves out what is not open: a resource without a record, then nothing at all', () => {
    expect(buildPageTitle({ resource: 'Users', site: 'Newsroom' })).toBe('Users · Newsroom')
    expect(buildPageTitle({ site: 'Newsroom' })).toBe('Newsroom')
  })

  it('falls back to the name of the product when the site has no title', () => {
    expect(buildPageTitle({ resource: 'Users' })).toBe(`Users · ${PRODUCT_NAME}`)
    expect(buildPageTitle()).toBe(PRODUCT_NAME)
  })

  it('does not say the same thing twice, and ignores blanks', () => {
    expect(buildPageTitle({ record: 'Users', resource: 'Users', site: 'Newsroom' })).toBe('Users · Newsroom')
    expect(buildPageTitle({ record: '  ', resource: 'Users', site: '' })).toBe(`Users · ${PRODUCT_NAME}`)
  })
})
