// Writes content.json: the products, the versions and the pages of the platform. It is a script so that the HTML of the pages is written as plain text here and not escaped by hand in a
// JSON file; the site does not need it: it loads content.json. Run it to make the file again: `node make-content.js`.
const fs = require('fs')
const path = require('path')

const products = [
  { slug: 'tidewater', name: 'Tidewater', summary: 'Keeps folders the same on all your machines, in the background.', order: 1, membersOnly: false },
  { slug: 'anchor', name: 'Anchor CLI', summary: 'One command to put a folder under Tidewater, from a script.', order: 2, membersOnly: false },
  { slug: 'lighthouse', name: 'Lighthouse Enterprise', summary: 'Monitoring and alerts for a fleet of Tidewater machines. For customers.', order: 3, membersOnly: true }
]

// [product, version, order, current, archived, published]
const versions = [
  ['tidewater', '3.0', 1, true, false, true],
  ['tidewater', '2.x', 2, false, true, true],
  ['tidewater', '3.1-draft', 0, false, false, false],
  ['anchor', '1.0', 1, true, false, true],
  ['lighthouse', '1.0', 1, true, false, true]
]

// [version, slug, group, order, title, summary, body, files, membersOnly, published]
const pages = [
  ['tidewater/3.0', 'install', 'Getting started', 1, 'Install Tidewater', 'One download, one command, and Tidewater runs in the background.',
    '<p>Tidewater is one program. It has no server to set up and no account to make.</p><h2>Install</h2><ol><li>Download the installer for your system.</li><li>Run it, and keep the folder it proposes.</li><li>Open a terminal and run <code>tidewater status</code>: it says <em>running</em>.</li></ol><h2>Where things are</h2><p>Your settings are in <code>~/.tidewater/config.json</code>. Nothing else is written outside the folders you choose to share.</p>',
    { diagram: 'tidewater-3.0-install.jpg' }, false, true],
  ['tidewater/3.0', 'first-sync', 'Getting started', 2, 'Your first sync', 'Choose a folder, add a second machine, and watch the two meet.',
    '<p>A sync is two folders that agree. Tidewater keeps them the same, whichever you change.</p><h2>Share a folder</h2><p>Run <code>tidewater share ~/Documents</code>. It prints a code of six words.</p><h2>Join from the other machine</h2><p>Run <code>tidewater join</code> and type the six words. The files arrive in the background; <code>tidewater status</code> shows how far it is.</p>',
    { download: 'tidewater-3.0-first-sync.pdf' }, false, true],
  ['tidewater/3.0', 'configuration', 'Using Tidewater', 3, 'Configuration reference', 'Every setting of config.json, with its default.',
    '<p>The file is JSON. A setting you leave out has its default.</p><table><thead><tr><th>Setting</th><th>Default</th><th>What it does</th></tr></thead><tbody><tr><td><code>port</code></td><td>7410</td><td>The port Tidewater listens on, on this machine.</td></tr><tr><td><code>pauseOnBattery</code></td><td>true</td><td>Stops syncing when a laptop runs on its battery.</td></tr><tr><td><code>ignore</code></td><td>[]</td><td>Patterns of files that are never synced.</td></tr></tbody></table>',
    { download: 'tidewater-3.0-configuration.pdf' }, false, true],
  ['tidewater/3.0', 'troubleshooting', 'Using Tidewater', 4, 'Troubleshooting', 'What to check when the two folders do not agree.',
    '<p>Start with <code>tidewater status</code>. It names what is waiting and why.</p><h2>The two machines do not find each other</h2><p>Both must be online, and the port in <code>config.json</code> must be open on the machine that shares.</p><h2>A file keeps coming back</h2><p>Another machine still has it. Remove it there too, or add it to <code>ignore</code>.</p>',
    {}, false, true],
  ['tidewater/3.0', 'single-sign-on', 'For teams', 5, 'Single sign-on setup', 'Let your team sign in with the account they already have.',
    '<p>Tidewater for teams speaks SAML. This page is for members.</p><h2>1. Register Tidewater with your identity provider</h2><p>Give it the address of your Tidewater server and the certificate it publishes at <code>/saml/metadata</code>.</p><h2>2. Map the groups</h2><p>A group of your provider becomes a team of Tidewater. A person who leaves the group loses access at the next sign-in.</p><h2>3. Test with one person</h2><p>Keep the local administrator account until one person has signed in through the provider.</p>',
    { diagram: 'tidewater-3.0-single-sign-on.jpg', download: 'tidewater-3.0-single-sign-on.pdf' }, true, true],
  ['tidewater/3.0', 'audit-log', 'For teams', 6, 'Audit log export', 'Send who did what to the system your security team reads.',
    '<p>Every share, join and removal is written to the audit log. This page is for members.</p><h2>Export</h2><p>Run <code>tidewater audit export --since 30d --format json</code>. Each line is one event, with the person, the folder and the time.</p><h2>Keep it</h2><p>The log is kept on the server for ninety days. Export it to keep it longer.</p>',
    {}, true, true],
  ['tidewater/2.x', 'install', 'Getting started', 1, 'Install Tidewater', 'Download, unpack, run.',
    '<p>In version 2 Tidewater is a folder you unpack and run by hand: <code>./tidewater start</code>. Version 3 installs itself and runs in the background.</p>',
    {}, false, true],
  ['tidewater/2.x', 'configuration', 'Using Tidewater', 2, 'Configuration reference', 'The settings of version 2.',
    '<p>The file is <code>tidewater.ini</code>. Version 3 moved to JSON, and has more settings.</p>',
    {}, false, true],
  ['tidewater/3.1-draft', 'install', 'Getting started', 1, 'Install Tidewater', 'Not published yet: it is a draft.',
    '<p>The next version is not final. This page is a draft and nobody can read it.</p>',
    {}, false, false],
  ['anchor/1.0', 'usage', 'Using Anchor', 1, 'Using the command', 'The three commands you need.',
    '<p><code>anchor add &lt;folder&gt;</code> puts a folder under Tidewater. <code>anchor list</code> shows what is shared. <code>anchor remove &lt;folder&gt;</code> stops sharing it, and keeps the files.</p>',
    {}, false, true],
  ['lighthouse/1.0', 'overview', 'Overview', 1, 'What Lighthouse watches', 'The machines, the folders and the queue, on one page.',
    '<p>Lighthouse reads the status of every Tidewater machine of your fleet and puts it on one page. This product is for customers.</p><h2>What is watched</h2><p>Whether a machine is online, how far behind it is, and which folders are paused.</p>',
    { diagram: 'lighthouse-1.0-overview.jpg' }, false, true],
  ['lighthouse/1.0', 'api-keys', 'Overview', 2, 'API keys', 'Make a key for a script, and take it away.',
    '<p>An API key lets a script read the status of the fleet. Make one in the Lighthouse settings, and revoke it there when the script is gone.</p>',
    { download: 'lighthouse-1.0-api-keys.pdf' }, false, true]
]

const content = {
  products: products.map((product) => ({ slug: product.slug, name: product.name, summary: product.summary, order: product.order, membersOnly: product.membersOnly, published: true })),
  versions: versions.map(([product, slug, order, current, archived, published]) => ({ key: `${product}/${slug}`, product: `products://${product}`, slug, order, current, archived, published })),
  pages: pages.map(([version, slug, group, order, title, summary, body, files, membersOnly, published]) => ({
    key: `${version}/${slug}`,
    version: `versions://${version}`,
    slug,
    group,
    order,
    title: { enUS: title },
    summary: { enUS: summary },
    body: { enUS: body },
    ...(files.diagram ? { diagram: `attachment://files/diagrams/${files.diagram}` } : {}),
    ...(files.download ? { download: `attachment://files/pdf/${files.download}` } : {}),
    membersOnly,
    published
  }))
}

fs.writeFileSync(path.join(__dirname, 'content.json'), `${JSON.stringify(content, null, 2)}\n`)
console.log(`${content.products.length} products, ${content.versions.length} versions and ${content.pages.length} pages written to content.json`)
