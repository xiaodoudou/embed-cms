# Known UI and design bugs

Problems in the admin app that a person sees, found while the documentation was checked against the code (October
2026). Backend and API bugs are in [BUGS.md](BUGS.md); the design rules these entries are measured against are in
[UI_REDESIGN.md](UI_REDESIGN.md).

**Read** means established by reading the code. None of these has been checked in a browser yet. Each entry links to its GitHub
issue. When you fix one, remove its entry in the same commit and close the issue from the commit message (`Fixes #N`).

## Plugin pages

**Import from remote is a placeholder, and every admin sees it.** [#43](https://github.com/xiaodoudou/node-cms-private/issues/43) `src/components/pages/ImportFromRemote.vue` shows two
dashed boxes labelled "local" and "remote" and an **Import** button that does nothing. The title is hard-coded English,
outside the translation files. The page is added whenever `importFromRemote` is set, which it is by default
(`src/main.js:143-145`), and it logs `MOUNTED` to the console. Hide it until it works, or build it.

**The Sync page's Deploy button always fails.** [#44](https://github.com/xiaodoudou/node-cms-private/issues/44) `SyncResource.vue:196` posts to `sync/:resource/from/…/to/…` without
the `token` the route requires, so the server answers 401 (`checkToken`, confirmed by `test/unit/sync.unit.test.js:49-53`).

**The Replicator page can't be reached, and would report success on failure.** [#45](https://github.com/xiaodoudou/node-cms-private/issues/45) `src/components/pages/CmsReplicator.vue`
is not registered or added to the menu anywhere in `src/`, so there is no way to open it. Once wired in, it would also
need a fix: the server collects peer errors into its result and answers 200 (`lib/plugins/replicator/index.js:146-151`),
and the page only looks at `res.ok` (lines 58-62), so its toast says "Sync finished" either way. Its labels are hard-coded
English.

**Cms Config is missing from the menu, and refused under Basic login.** [#46](https://github.com/xiaodoudou/node-cms-private/issues/46) The page is only listed for groups whose
`plugins` contain "Cms Config", and the `admins` group gets only "Syslog" at boot
(`lib/plugins/authentication/index.js:24`). With the default Basic login the page then answers 403 (see
[BUGS.md](BUGS.md#authentication-and-admin)).

## Layout and display

**The paragraph badge shows the position, not the width.** [#47](https://github.com/xiaodoudou/node-cms-private/issues/47) In a dynamic layout every item carries a badge at the top
centre reading `2/5` (its position and the number of items, `ParagraphView.vue:43, 1169-1182`), always visible. It looks
like a width ratio, which is how the old documentation described it.

**The Disk gauge shows free space next to a "used" label.** [#48](https://github.com/xiaodoudou/node-cms-private/issues/48) `SystemInfo.vue:44-46` draws `100 - usedPercentage` for the
number and the bar, beside a "used / total" text. The memory gauge, just above, shows used space.

**Menu groups are not in alphabetical order.** [#49](https://github.com/xiaodoudou/node-cms-private/issues/49) `App.vue:292-296` sorts with `TranslateService.get(item.name, 'enUS')`,
which returns an empty string for group names given per language, and compares `item.name === 'CMS'` with an object. Groups
end up in the order of their first resource's title.

**Dark mode is off for users whose theme is dark.** [#50](https://github.com/xiaodoudou/node-cms-private/issues/50) `_users.theme` defaults to `dark`, but `disableDarkMode` defaults to
`true`, which forces the light theme and hides the switch (`App.vue:531-533`). The login page ignores the option and
follows the system preference, so a user can see a dark login and a light admin.

**There is no logout button with the default login.** [#51](https://github.com/xiaodoudou/node-cms-private/issues/51) With Basic authentication `showLogoutButton` is false
(`SystemInfo.vue:102`), which is correct (a browser can't forget Basic credentials on request), but nothing tells the user
how to sign out. A short hint where the button would be would help.
