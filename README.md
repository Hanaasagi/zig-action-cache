# GitHub Action Cache For Zig

An out-of-the-box GitHub Action that automatically caches dependencies and compiled artifacts for a Zig project.

## How it works 

Firstly, it calculates a key based on the following states:

- The version of `zig` and the output information of `zig env`.
- Environment variables during compilation, which can be configured through the `env-vars` parameter in YAML.
- The file hashes of `build.zig` and `deps.zig`.
- Automatic detection of whether a package manager is used and file hash calculation for `gyro.zzz` or `zig.mod`.
- User-configured keys, as shown in the configuration file below.

Then it checks the history to see if there is a build workflow with the same key. If a match is found, it will restore the cache from the previous build.

What directories will it cache?

- `global_cache_dir` in `zig env`
- `zig-cache`
- If you're using a package manager and there is a lock file, then directories such as `.gyro/` or `.zigmod/` will be cached.


## Example

```YAML
name: CI

on:
  push:
    branches: ["master"]
  pull_request:
    branches: ["master"]
  workflow_dispatch:

jobs:
  test:
    name: Tests on Linux
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: goto-bus-stop/setup-zig@v2
        with:
          version: 0.10.1
      - uses: Hanaasagi/zig-action-cache@master  # Or Hanaasagi/zig-action-cache@v1
        with:
          # description: 'The prefix cache key, this can be changed to start a new cache manually.'
          # required: false
          # default: 'zig-cache-step-0'
          prefix-key: ""

          # description: 'A cache key that is used instead of the automatic `job`-based key, and is stable over multiple jobs.'
          # required: false
          # default: ""
          shared-key: ""

          # description: 'An additional cache key that is added alongside the automatic `job`-based cache key and can be used to further differentiate jobs.'
          # required: false
          # default: ""
          key: ""

          # description: 'Additional environment variables to include in the cache key, separated by spaces.'
          # required: false
          # default: ""
          env-vars: ""

          # description: 'Additional non workspace directories to be cached, separated by newlines.'
          # required: false
          # default: ""
          cache-directories: ""

          # description: 'Cache even if the build fails. Defaults to false.'
          # required: false
          # default: 'false'
          cache-on-failure: true

      - name: Build
        run: zig build
      - name: Run Tests
        run: zig build test
```

<hr>

*Please feel free to report bugs or open pull requests.*
