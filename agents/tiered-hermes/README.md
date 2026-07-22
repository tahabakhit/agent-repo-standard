# Tiered Hermes

An optional, independently removable memory-provider extension for
[Hermes Agent](https://github.com/NousResearch/hermes-agent). It composes local
and optional memory layers behind Hermes's normal provider interface and does not
modify Hermes core.

Deployment profiles, endpoints, credentials, and private knowledge paths are not
part of this component. Supply them through Hermes configuration and environment
variables. Test in a temporary `HERMES_HOME` before any live adoption.

The wiki tier requires the `rg` (ripgrep) system command. It has no Python
package extra. Install all Python-backed optional tiers with `pip install
'tiered-hermes[all]'`.

```sh
uv run --directory agents/tiered-hermes --with pytest --with pyyaml --with mnemosyne-hermes \
  python -m pytest tests -q
```

Source provenance: migrated from `hermes-meta` commit `ec2ac8a`.
