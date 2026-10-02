// Thrown by a store that was asked to change a record it does not own (the id says another machine made it). It used to be a
// returned { error } that callers took for a result, so the record stayed and nobody was told.
class ForeignRecordError extends Error {
  constructor (id) {
    super('Can\'t modify foreign records')
    this.name = 'ForeignRecordError'
    this.code = 'EFOREIGN'
    this.id = id
  }
}

module.exports = ForeignRecordError
