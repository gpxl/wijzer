# Vendored OpenWiki source — provenance

These files are copied verbatim from **[langchain-ai/openwiki](https://github.com/langchain-ai/openwiki)**
(MIT) so wijzer can cross-validate its dependency-free bash ports against the real
TypeScript specification. They are **not** part of wijzer's runtime and add no
runtime dependency — Vitest transforms the `.ts` on the fly.

- **Pinned commit:** `23428de0cc0b1b6d3e5d09be413e92a5d6ee451f`
- **Source:** https://github.com/langchain-ai/openwiki/tree/23428de0cc0b1b6d3e5d09be413e92a5d6ee451f
- **Fetched (UTC):** 2026-07-08
- **Regenerate with:** `scripts/vendor-openwiki.sh`

The pinned commit MUST match PARITY.md's "Upstream validated against" SHA;
`tests/vendor-openwiki.test.ts` fails if the two drift apart. Each file below was
verified at fetch time against its upstream git blob SHA.

| Vendored path | Upstream path | Upstream blob SHA |
|---|---|---|
| `src/constants.ts` | `src/constants.ts` | `187229bce421b1868514a0e767b93b2e45b7c60e` |
| `src/agent/types.ts` | `src/agent/types.ts` | `dc7869003215041eb5ee5ff0a3e041ad395851c3` |
| `src/agent/utils.ts` | `src/agent/utils.ts` | `1cf5cc392cb866b2d7e98931401b629934592b82` |
| `src/agent/prompt.ts` | `src/agent/prompt.ts` | `f7d02d2a34f5bf5276c99b40ac2ed02817846932` |
| `test/update-noop.test.ts` | `test/update-noop.test.ts` | `e530b1d2ea37e6f6c66d8f893aa4e58bf87fdb9c` |
| `LICENSE` | `LICENSE` | `14fac913ccf80234b1848540089a3bbcb6e5283d` |

> `.ts` files carry an MIT attribution header (so the git blob SHA of the
> committed file differs from the upstream blob SHA above); `LICENSE` is verbatim.
> The offline drift-lock in `manifest.blobsha` records the committed files' own
> blob SHAs.
