/**
 * @fileoverview Global JSDoc type definitions for Embed CMS
 * Include this file or reference it in your project for IDE autocomplete
 */

/**
 * @global
 * @namespace EmbedCMS
 */

/**
 * @typedef {Object} EmbedCMS.CMSRecord
 * @property {string} _id - Unique identifier for the record
 * @property {number} _createdAt - Creation timestamp
 * @property {number} _updatedAt - Last update timestamp
 * @property {number} [_publishedAt] - Published timestamp
 * @property {string} [_updatedBy] - Updated by user
 * @property {EmbedCMS.Attachment[]} [_attachments] - Array of attached files
 * @property {boolean} [_local] - Whether the record is local to this CMS instance
 */

/**
 * @typedef {Object} EmbedCMS.Attachment
 * @property {string} _id - Unique identifier for the attachment
 * @property {string} _name - Field name the attachment belongs to
 * @property {string} _filename - Original filename
 * @property {string} _contentType - MIME type of the file
 * @property {string} _md5sum - MD5 hash of the file
 * @property {number} _size - File size in bytes
 * @property {number} _createdAt - Creation timestamp
 * @property {number} _updatedAt - Last update timestamp
 * @property {Object} _fields - Additional fields from upload
 * @property {Object} _payload - Additional payload data
 * @property {ReadableStream} [stream] - File stream (when reading)
 */

/**
 * @typedef {Object} EmbedCMS.QueryOptions
 * @property {number} [page] - Page number (0-based)
 * @property {number} [limit] - Number of records per page
 * @property {string} [locale] - Locale for localized content
 */

/**
 * Resource API methods available through api('resourceName')
 * @typedef {Object} EmbedCMS.ResourceAPI
 * @property {function(Object=, EmbedCMS.QueryOptions=): Promise<EmbedCMS.CMSRecord[]>} list - List all records matching query
 * @property {function(string|Object, EmbedCMS.QueryOptions=): Promise<EmbedCMS.CMSRecord>} find - Find a single record by ID or query
 * @property {function(string|Object): Promise<boolean>} exists - Check if a record exists
 * @property {function(Object, Object=): Promise<EmbedCMS.CMSRecord>} create - Create a new record
 * @property {function(string, Object, Object=): Promise<EmbedCMS.CMSRecord>} update - Update an existing record
 * @property {function(string): Promise<boolean>} remove - Remove a record
 * @property {function(string, Object): Promise<EmbedCMS.Attachment>} createAttachment - Create an attachment for a record
 * @property {function(string, string, Object): Promise<EmbedCMS.Attachment>} updateAttachment - Update an attachment
 * @property {function(string, string): Promise<EmbedCMS.Attachment>} findAttachment - Find an attachment with its stream
 * @property {function(string): Promise<ReadableStream>} findFile - Find a file stream by attachment ID
 * @property {function(string, string): Promise<boolean>} removeAttachment - Remove an attachment from a record
 * @property {function(): Promise<boolean>} cleanAttachment - Clean orphaned attachments
 * @property {function(Array, Object=, boolean=): Promise<Object>} getImportMap - Get import mapping for bulk operations
 * @property {function(): string[]} getUniqueKeys - Get unique key fields for this resource
 */

// Export for CommonJS (Node.js) compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {};
}
