# Essence — docs, comments, and notes

Docs are read cold, long after the change. They must stand fully on their own.

- Comment the *why*, never a restatement of the signature. Match the surrounding
  code's comment density and idiom.
- Cut duplicated authority — link to the one authoritative source instead of
  restating it.
- Preserve every protected span verbatim: fenced and inline code, URLs, file
  paths, commands, and error strings. A rewrite that alters any of these has
  changed meaning, not just style. The mechanical guard in
  `src/essence/essenceDoc.ts` extracts these spans so a rewrite can be checked
  for drift.
- Keep genuine caveats and preconditions; cut only reflexive hedging.
