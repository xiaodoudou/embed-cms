← [Field types](../FIELDS.md) · [Documentation](../../README.md)

# Custom field types

The `input` value of a field selects a component through `src/services/FormService.js` (`typeMapper`). The table of every supported type, its component and its documentation page is in [`docs/reference/FIELDS.md`](../FIELDS.md).

A value that is not a key of `typeMapper` is not rendered. To add a type, register it in `typeMapper` with the Vue component to use and, when needed, a `validator`, then document it with a page in this folder.
