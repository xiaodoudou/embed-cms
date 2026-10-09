// A folder that only the account the server runs as can enter. The sessions are kept in one: a session holds the login token of a person, so a file of it that
// another account of the machine can read is a login that can be taken.
const fs = require('fs')

/**
 * Makes the folder if it is not there, and sets it to owner only (0700), also when an earlier version made it with the permissions of the umask (0755).
 * Where the system has no such permissions (Windows) the call changes nothing.
 * @param {string} folder
 */
function ensurePrivateFolder (folder) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 })
  fs.chmodSync(folder, 0o700)
}

module.exports = { ensurePrivateFolder }
