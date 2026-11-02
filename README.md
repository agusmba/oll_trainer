# OLL trainer

A web tool for timing OLL case solves: select cases, solve scrambled ones against a goal
time, and the trainer biases which cases reappear based on how often each case is beaten.

This fork adapts the original tool by [Roman Strakhov](https://github.com/Roman-/oll_trainer),
which he hosted at [bestsiteever.net/oll/](https://bestsiteever.net/oll/). The purpose of the
project and its details are described on the speedsolving forum in
[this post](https://www.speedsolving.com/forum/threads/oll-trainer.66924/).

![oll trainer demo](demo.gif)

Questions, suggestions and bug reports: open an issue on
[the fork's issue tracker](https://github.com/agusmba/oll_trainer/issues).

Download an offline copy: [zip](https://github.com/agusmba/oll_trainer/archive/main.zip).

Dev-only tooling
----------------

The app is plain files with no build step; the tests and the cache-busting helper are not
part of it.

- `npm run browser:install` — fetch the headless chromium the suite needs (once)
- `npm test` — headless browser tests plus the cache-bust tests
- `npm run bump-version` / `npm run bump-version:check` — raise the `?vN` asset versions in
  `index.html`, one bump per changed directory per branch

Contributing workflow
---------------------

For contributing, follow the "fork-and-pull" Git workflow.

 1. **Fork** the repo on GitHub
 2. **Clone** the project to your own machine
 3. **Commit** changes to your own branch
 4. **Push** your work back up to your fork
 5. Submit a **Pull request** so that I can review your changes
