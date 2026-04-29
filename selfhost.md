# Self-hosting

The canonical self-hosting guide has moved to [`docs/self-hosting.md`](docs/self-hosting.md).

Use:

```zsh
./self_host.zsh [setup|redeploy] [public_url] [game ...]
./self_host.zsh [start|dev-start] [public_url]
./self_host.zsh stop
```

`setup` and `redeploy` default to deploying only Secret Codes (`secretcodes` / alias `secretnames`). Pass game directory names to deploy a different subset.
