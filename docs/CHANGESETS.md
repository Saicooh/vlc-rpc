# Changesets

Every user facing change carries a changeset: a small file under `.changeset/` that says how the
version should move and what a person will see differently. Those files are what writes
`CHANGELOG.md` and what decides the next version number, so the release notes get written while the
change is fresh instead of being reconstructed from commit messages months later.

## Writing one

```bash
bun run changeset
```

It asks for a bump and a summary, then writes a file under `.changeset/`. Commit that file in the
same change it describes.

- `patch` for a fix that changes nothing anybody chose.
- `minor` for something new that breaks nothing.
- `major` for a change that breaks something someone relied on, a default that moves included.

Write them in English, in the voice of the ones already in the folder: what changed, what a person
sees differently, and the reason when the reason is the interesting part. No em dashes. A changeset
is for what a user can notice, so a refactor, a CI change or a documentation edit does not get one.

Good:

```markdown
Audio files with no embedded artwork now get a cover.

- The app looks the track up by its tags and uses the release cover it finds.
- A lookup that finds nothing leaves the frame empty instead of risking the wrong one.
```

Bad:

```markdown
Fixed stuff
```

## What ships them

Two workflows, and neither one publishes by itself.

`ci.yml` runs on every push and pull request to `main`: `lint:check`, both typechecks, the suite and
a Windows build and the Electron flow tests. It does not check whether a changeset exists, so that
part is on the author.

`release.yml` runs only when a maintainer dispatches it by hand from `main` in the Actions tab.
It checks lint, types and unit tests, applies the pending changesets, refuses an existing release
tag, then runs the Electron flow tests and builds the Windows binaries. Only a successful build
gets its version commit and tag pushed together. Concurrent releases are queued, and tags are
never overwritten.

The workflow uploads all binaries and update metadata to a draft release before publishing it.
If an upload fails, the draft stays unpublished: inspect and complete that draft manually before
publishing it. A retry with the same version stops because its tag already exists. There is no
Version Packages pull request, and merging to `main` releases nothing.

## Scripts

```bash
bun run changeset          # write a new changeset
bun run changeset:version  # apply the pending ones, bump the version, write the changelog
bun run changeset:publish  # publish, which the release workflow does not use
```

`changeset:version` is what the release workflow runs. Running it locally is useful to see what the
next version would be, but the version commit belongs to the workflow.

## Links

- [Changesets](https://github.com/changesets/changesets)
- [Semantic versioning](https://semver.org/)
