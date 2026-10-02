const _ = require('lodash')
const path = require('path')
const md5File = require('md5-file')

function determineResourceOrder(resources, schemaMap) {
  const graph = new Map()
  const inDegree = new Map()
  for (const resource of resources) {
    graph.set(resource, [])
    inDegree.set(resource, 0)
  }
  for (const resource of resources) {
    const schema = _.get(schemaMap, [resource, 'schema'], [])
    for (const field of schema) {
      if (field.source && resources.includes(field.source)) {
        if (!graph.get(field.source).includes(resource)) {
          graph.get(field.source).push(resource)
          inDegree.set(resource, inDegree.get(resource) + 1)
        }
      }
    }
  }
  const queue = []
  for (const [resource, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(resource)
    }
  }
  const sortedOrder = []
  while (queue.length > 0) {
    const resource = queue.shift()
    sortedOrder.push(resource)
    const neighbors = graph.get(resource)
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1)
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor)
      }
    }
  }
  if (sortedOrder.length !== resources.length) {
    return resources
  }
  return sortedOrder
}

/**
 * Joins segments under a base folder and refuses any result that would land outside of it.
 * Segments come from remote records (unique keys, field names, filenames), so they are untrusted.
 * @param {string} base - folder the result must stay inside
 * @param {...*} segments - path segments, coerced to strings
 * @returns {string} absolute path inside base
 * @throws {Error} when the joined path escapes base
 */
function safeJoin(base, ...segments) {
  const root = path.resolve(base)
  const target = path.resolve(root, ...segments.map(segment => String(segment)))
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Refusing to use a path outside of ${base}: ${JSON.stringify(segments)}`)
  }
  return target
}

function getFilename(attachment) {
  // a filename is never a path: keep the last segment only, whatever the remote sent
  let name = _.get(attachment, '_filename')
  if (!name) {
    name = _.first(String(_.get(attachment, 'url', attachment)).split('?'))
  }
  return path.basename(String(name).replaceAll(String.fromCharCode(92), '/'))
}

function findMatches(obj, regex, field) {
  const results = []
  function traverse(value, path = '') {
    if (value && _.isObject(value)) {
      if (regex.test(path) && _.endsWith(path, field)) {
        results.push({path, value})
      }
      for (let key in value) {
        if (_.isArray(value)) {
          traverse(value[key], `${path}[${key}]`)
        } else {
          traverse(value[key], path ? `${path}.${key}` : key)
        }
      }
    }
  }
  traverse(obj)
  return results
}

function getAttachmentFields(resource, remoteSchemaMap) {
  const attachmentFields = _.get(remoteSchemaMap[resource], '_attachmentFields', false)
  return attachmentFields ? attachmentFields : _.filter(remoteSchemaMap[resource].schema, (field)=> _.includes(['file', 'image'], field.input))
}

function getAttachments(record, attachmentName, config) {
  const attachments = _.get(record, attachmentName, _.filter(_.get(record, '_attachments', []), {_name: attachmentName}))
  return _.compact(_.map(attachments, (attachment)=> {
    if (_.get(attachment, 'url', false)) {
      if (!_.startsWith(attachment.url, 'http')) {
        attachment.url = `${buildUrl(config.remote, false)}${attachment.url}`
      }
      return _.omit(attachment, ['_id', '_createdAt', '_updatedAt'])
    }
  }))
}

function convertKeyToId(field, v, remoteToLocalIdMap, originalRemoteRecords) {
  const localId = _.get(remoteToLocalIdMap, `${field.source}.${v}`, false)
  if (!localId) {
    const foundRemoteRecord = _.find(originalRemoteRecords[field.source], {_id: v})
    if (!foundRemoteRecord) {
      return null
    }
  }
  return localId || v
}

function buildUrl(config, withPrefix = true) {
  return `${config.protocol}${config.host}${withPrefix ? (config.prefix || '') : ''}`
}

function filterAttachments(list, attachmentsToIgnore) {
  return _.filter(list, key => !_.includes(attachmentsToIgnore, key))
}

async function md5FileAsync(filePath) {
  return await md5File(filePath)
}

module.exports = {
  determineResourceOrder,
  safeJoin,
  getFilename,
  findMatches,
  getAttachmentFields,
  getAttachments,
  convertKeyToId,
  filterAttachments,
  md5FileAsync
}
