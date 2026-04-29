# Secret Codes wordpacks and room flow

Secret Codes built-in wordpacks live in `web/src/games/secretcodes/wordpacks/` as `.txt` files. Each non-empty line is one card word. Leading/trailing whitespace is ignored, and lines starting with `#` are comments. The first comment line can be used as the display label. New `.txt` files in this directory are auto-discovered at web build time and shown as wordpack options.

Rooms may be started before every seat is filled when the joined player count is at least the selected game's minimum player count. When this happens, the server trims the match capacity to the joined players before creating the boardgame.io match.

Finished online matches expose their Play Again next-room link through a public mutation so visitors who open an old finished-game link can follow the chain to the latest room.
