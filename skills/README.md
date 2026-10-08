← [embed-cms](../README.md)

# Agent skills

Eight skills that teach a coding agent how to build and run a site on embed-cms. Each one holds the commands, rules and traps of one job, taken from this documentation. They are plain [Agent Skills](https://agentskills.io): a folder with a `SKILL.md`, which Claude Code, Codex, Gemini CLI, Cursor, GitHub Copilot, OpenCode and many other agents read (the [list of supporting agents](https://agentskills.io) is on the standard's site).

| Skill | Use it to |
|---|---|
| [embed-cms-create-site](embed-cms-create-site/SKILL.md) | start a site: server, resources, templates, first run |
| [embed-cms-model-content](embed-cms-model-content/SKILL.md) | declare or change resources, fields, locales and relations |
| [embed-cms-add-content](embed-cms-add-content/SKILL.md) | create records and upload files, over REST or in code |
| [embed-cms-patch-content](embed-cms-patch-content/SKILL.md) | change existing records, one or in bulk, with a dry run |
| [embed-cms-load-payload](embed-cms-load-payload/SKILL.md) | load a `content.json` and its files with `cms-load` |
| [embed-cms-backup-restore](embed-cms-backup-restore/SKILL.md) | back up and restore the records and the files |
| [embed-cms-sync-migrate](embed-cms-sync-migrate/SKILL.md) | sync servers, import spreadsheets, switch storage engine |
| [embed-cms-go-production](embed-cms-go-production/SKILL.md) | secrets, accounts, proxy, Docker and the hardening checklist |

## Install

In a project that has embed-cms (`npm install embed-cms`), run the `cms-skills` command from the project folder:

```sh
npx cms-skills              # into ./.agents/skills, the folder agents share
npx cms-skills --claude     # into ./.claude/skills, for Claude Code
npx cms-skills --user       # into your home folder, for every project
npx cms-skills --to ./path/to/skills
```

The folder `.agents/skills` is the one the Agent Skills convention shares between agents. Claude Code reads `.claude/skills`, so add `--claude` for it. `--force` replaces skills that are already installed, and `--list` shows what would be copied without copying anything. A skill that is already there is kept.

You can also copy the `embed-cms-*` folders yourself, from this directory or from `node_modules/embed-cms/skills/`, into the skills folder your agent reads.

Claude Code can install them as a plugin straight from this repository:

```sh
/plugin marketplace add xiaodoudou/embed-cms
/plugin install embed-cms@embed-cms
```

The plugin is the whole repository, so installing it clones everything. `npx cms-skills --claude` copies only the skills.

The skills describe the commands of the version they ship with. For what they leave out, such as every field type and option, they point to the documentation in this repository.
