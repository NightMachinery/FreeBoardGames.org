## Commands to know:

* `pnpm run dev` builds and starts the development **web** server.
* `pnpm run prod` builds and starts the production **web** server.
* `pnpm run bgio` builds and starts the **boardgame.io** server.
* `pnpm run bgio:dev` builds and starts the **boardgame.io** server.  The **boardgame.io** server will automatically recompile/restart on file changes.
* `pnpm run test` runs all **unit tests**.
* `pnpm run e2e:buildandstartserver` builds and starts an unoptimized production server for use with Cypress visual testing.
* `pnpm run cyp:run` runs Cypress visual tests.
* `pnpm run autopre` will prepare your changes to be commit to git.  It will automatically format your code and then run the same tests as CI (or `pnpm run pre`) would.
* `pnpm run pre` will run the same tests that will be run by CI.
  * NOTE: Upon submission of a pull request, CI will automatically run various tests.  These tests must pass in order for changes to be accepted.

