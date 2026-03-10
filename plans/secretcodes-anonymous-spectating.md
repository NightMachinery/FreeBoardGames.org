# Secret Codes: anonymous spectator access from room link after match start

## Summary
Allow a user with no nickname/account to open a Secret Codes room/join link **after the room has already started** and land in the live match as a **read-only spectator**. Spectators must see the normal player view only (never spymaster-only card colors), and they may read match chat but cannot send chat or take a seat.

## Key changes
- **Anonymous room follow-through**
  - Update the room-page flow so `/room/[roomID]` does **not** require `NicknameRequired` when the room already has `matchId`.
  - Add an anonymous-safe room lookup path that returns just enough metadata to detect `matchId`, `gameCode`, and public player list without creating a room membership.
  - When `matchId` exists, redirect anonymous visitors straight to `/match/[matchId]`; keep current authenticated `joinRoom` behavior for pre-start rooms.

- **Anonymous match loading**
  - Remove the unconditional `NicknameRequired` gate from the match page.
  - Add an anonymous-safe match query / server path that returns:
    - `gameCode`
    - `bgioServerUrl`
    - `bgioMatchId`
    - `playerMemberships`
    - **no** `bgioSecret`
    - **no** `bgioPlayerId`
  - Keep the existing authenticated match query behavior for actual players so seated players still receive credentials.
  - In the client, treat missing `bgioPlayerId` / secret as spectator mode (`playerID = null`, `credentials = null`).

- **Secret Codes spectator behavior**
  - Preserve the existing safety model in `SecretcodesGame.playerView`: anonymous spectators already get hidden card colors during active play because `playerID === null`.
  - Ensure the Secret Codes board behaves correctly with `playerID = null`:
    - no spymaster toggle button
    - no moves
    - same visible information as a normal non-spymaster player
    - game-over rendering may remain fully revealed if that is current intended game behavior

- **Chat behavior**
  - Keep match chat subscription readable for anonymous spectators.
  - Disable or hide the chat input for anonymous viewers on the match page so they cannot attempt to send.
  - Do not create any transient nickname/user for anonymous spectators.

## Public API / interface changes
- Add anonymous-safe GraphQL read paths for:
  - room lookup by `roomId` (pre-join inspection)
  - match lookup by `matchId` (spectator-safe)
- Preserve existing authenticated mutations/queries:
  - `joinRoom`
  - authenticated `match` fetch for players, or equivalent authenticated branch
- Frontend match-loading types should explicitly allow `bgioSecret` and `bgioPlayerId` to be absent for spectators.

## Test plan
- **Room flow**
  - Anonymous user opens a room link before game start → still gets nickname prompt / no auto-spectate.
  - Anonymous user opens a room link after game start → redirects to the match without becoming a room member.
- **Match loading**
  - Authenticated player gets own `bgioSecret`/`bgioPlayerId`.
  - Anonymous viewer gets no credentials and loads with `playerID = null`.
- **Secret Codes visibility**
  - Anonymous spectator during active play cannot see unrevealed card colors.
  - Anonymous spectator cannot enable spymaster view.
  - Anonymous spectator cannot trigger `chooseCard` or `pass`.
- **Chat**
  - Anonymous spectator can subscribe to and read match chat.
  - Anonymous spectator cannot send a match chat message from the UI.
- **Regression**
  - Normal authenticated room join/start flow still works.
  - Existing seated-player match experience is unchanged.

## Assumptions
- Scope is **Secret Codes / Secretnames only for the product requirement**, but the room→match anonymous redirect and spectator-safe match fetch can be implemented generically if that is the cleanest code path.
- “Anonymous” means **no nickname prompt, no room membership, no player credentials**.
- Chat for anonymous spectators is **read-only**.
- Current post-game full-board reveal behavior is acceptable and does not need to be changed.
