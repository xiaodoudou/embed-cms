import _ from 'lodash'

// what the product is called when a site gives its admin no title of its own (Settings > Title)
export const PRODUCT_NAME = 'Embed CMS'

/**
 * The title of the browser tab, from the most specific part to the site: "Gamma · Reference items · Newsroom".
 * @param {{record?: string, resource?: string, site?: string}} parts the record being edited, the resource or plugin page open, and the title of the site
 * @returns {string}
 */
export function buildPageTitle ({ record = '', resource = '', site = '' } = {}) {
  return _.uniq(_.filter([record, resource, site || PRODUCT_NAME], (part) => _.isString(part) && _.trim(part) !== '')).join(' · ')
}

export default { buildPageTitle, PRODUCT_NAME }
