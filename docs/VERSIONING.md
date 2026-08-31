# Versioning and releases

TimeTone uses Semantic Versioning (`MAJOR.MINOR.PATCH`) for coordinated
dashboard and terminal releases. The repository version is recorded in the
root `VERSION` file; the dashboard package and terminal firmware report the
same version.

- **MAJOR**: incompatible API, data, or device changes requiring migration.
- **MINOR**: backwards-compatible features.
- **PATCH**: backwards-compatible fixes, security updates, and documentation.

Every release must:

1. Update `VERSION`, `web/package.json`, `firmware/main/timekeep.h`, and
   `CHANGELOG.md`.
2. Run the web tests, lint, TypeScript check, production build, and firmware
   build.
3. Commit the changes, create an annotated `vMAJOR.MINOR.PATCH` tag, and push
   the branch and tag.
4. Publish a GitHub release using the matching changelog section and attach
   distributable firmware binaries when available.

Pre-release identifiers such as `-rc.1` are allowed for testing and must not
be used as the production version reported by a terminal.
