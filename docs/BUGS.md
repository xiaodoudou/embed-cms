# Known bugs

These are bugs found while the documentation was checked against the code (October 2026). None of them is fixed yet:
this page records them so nobody has to find them twice, and so the docs can point here instead of describing broken
behaviour as a feature.

Each entry says what happens, where in the code, and how we know: **seen** means reproduced against a running CMS,
**read** means established by reading the code. Line numbers are those of the commit this page was written on.
Interface problems are in [UI_BUGS.md](UI_BUGS.md).

Each entry links to its GitHub issue. When you fix one, add a regression test, remove the entry in the same commit, and close the issue from the commit message (`Fixes #N`).

No known backend bug is open at the moment.
