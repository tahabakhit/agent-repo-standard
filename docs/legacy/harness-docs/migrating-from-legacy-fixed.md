# Migrating from the legacy fixed profile

The signed annotated tag `legacy-fixed-v1.0.11` is the final supported historical
Copier-compatible state. It resolves to commit
`9feb5960714fcf0c67b87020630c3a1fed233c8e`. The fixed generator and its dedicated
support surface do not exist on the current Amanar branch.

Use `$amanar-scaffold audit` for an existing repository, then
`$amanar-scaffold adopt` only when changes are justified. Use
`$amanar-scaffold new` for a new repository. These adaptive workflows preserve
valid custom structures and do not imply a Copier update path.

Historical generated repositories remain independent. Do not retrieve the tagged
generator and run it over a non-empty repository. The compatibility tag is a
recovery and provenance boundary, not a current interface.
