// The design tokens a plugin may rely on: they keep their names and their meaning inside a major version. Every other --cms-*
// variable is private and free to change. The Design system page draws this list, and a test checks that each token exists in
// src/styles/tokens.scss (colours in both the light and the dark palette).
export const PUBLIC_TOKENS = [
  {
    group: 'Surfaces and text',
    colour: true,
    tokens: [
      ['--cms-bg', 'The page background'],
      ['--cms-surface', 'Cards, panels, the app bar'],
      ['--cms-surface-2', 'An inset or raised surface, inputs at rest, the stripe of a table'],
      ['--cms-surface-3', 'The hover on surface-2'],
      ['--cms-text', 'Body text'],
      ['--cms-text-muted', 'Secondary text'],
      ['--cms-text-inverse', 'Text on a dark tooltip or a dark surface'],
      ['--cms-border', 'A hairline between things'],
      ['--cms-border-strong', 'The border of a control']
    ]
  },
  {
    group: 'Brand',
    colour: true,
    tokens: [
      ['--cms-primary', 'The accent: primary buttons, links, the selected state'],
      ['--cms-primary-hover', 'The accent while hovered'],
      ['--cms-primary-soft', 'A tint of the accent for selected rows and chips'],
      ['--cms-on-primary', 'Text on the accent'],
      ['--cms-on-primary-soft', 'Text on the soft tint']
    ]
  },
  {
    group: 'Status',
    colour: true,
    tokens: [
      ['--cms-success', 'Success, as text or a bar'],
      ['--cms-success-soft', 'The background of a success message'],
      ['--cms-warning', 'Warning, as text or a bar'],
      ['--cms-warning-soft', 'The background of a warning'],
      ['--cms-error', 'Error, as text or a bar'],
      ['--cms-error-soft', 'The background of an error'],
      ['--cms-on-error', 'Text on the error colour'],
      ['--cms-info', 'Information, as text or a bar'],
      ['--cms-info-soft', 'The background of an information message']
    ]
  },
  {
    group: 'Form controls',
    colour: true,
    tokens: [
      ['--cms-focus-ring', 'The outline of a focused element'],
      ['--cms-field-bg', 'The surface of a control'],
      ['--cms-field-ring', 'The halo around a focused control'],
      ['--cms-field-readonly-bg', 'The surface of a read-only control'],
      ['--cms-field-disabled-bg', 'The surface of a disabled control']
    ]
  },
  {
    group: 'Space',
    tokens: [
      ['--cms-space-1', '4px'],
      ['--cms-space-2', '8px'],
      ['--cms-space-3', '12px'],
      ['--cms-space-4', '16px'],
      ['--cms-space-5', '20px'],
      ['--cms-space-6', '24px'],
      ['--cms-space-8', '32px'],
      ['--cms-space-10', '40px'],
      ['--cms-space-12', '48px'],
      ['--cms-field-h', 'The height of a control (40px)']
    ]
  },
  {
    group: 'Shape and depth',
    tokens: [
      ['--cms-radius-xs', 'A small corner (a key, a code span)'],
      ['--cms-radius-sm', 'Buttons inside a group, the box of a toggle'],
      ['--cms-radius-md', 'Controls and callouts'],
      ['--cms-radius-lg', 'Cards and tables'],
      ['--cms-radius-pill', 'Chips, badges, switches'],
      ['--cms-shadow-1', 'A card at rest'],
      ['--cms-shadow-2', 'A menu'],
      ['--cms-shadow-3', 'A dialog']
    ]
  },
  {
    group: 'Type',
    tokens: [
      ['--cms-font-sans', 'The text font'],
      ['--cms-font-mono', 'The code font'],
      ['--cms-fs-xs', 'The smallest text'],
      ['--cms-fs-sm', 'Small text, hints, labels'],
      ['--cms-fs-base', 'Body text'],
      ['--cms-fs-md', 'A little larger than body text'],
      ['--cms-fs-lg', 'A section title'],
      ['--cms-fs-xl', 'A page section heading'],
      ['--cms-fs-2xl', 'A page title'],
      ['--cms-fw-regular', 'Regular weight'],
      ['--cms-fw-medium', 'Medium weight'],
      ['--cms-fw-semibold', 'Semibold weight'],
      ['--cms-fw-bold', 'Bold weight'],
      ['--cms-lh-tight', 'The line height of headings'],
      ['--cms-lh-base', 'The line height of text']
    ]
  },
  {
    group: 'Motion',
    tokens: [
      ['--cms-motion-fast', 'A hover or a press'],
      ['--cms-motion-nav', 'A menu opening'],
      ['--cms-motion-base', 'A sliding or fading element'],
      ['--cms-ease', 'The easing curve']
    ]
  },
  {
    group: 'Breakpoints',
    tokens: [
      ['--cms-bp-sm', '600px: under it a phone layout'],
      ['--cms-bp-md', '768px: under it a tablet layout'],
      ['--cms-bp-lg', '1024px: from it a desktop layout']
    ]
  }
]

export const publicTokenNames = () => PUBLIC_TOKENS.flatMap((group) => group.tokens.map(([name]) => name))
