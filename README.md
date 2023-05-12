# GitHub Action Cache For Zig

A GitHub Action that implements caching rules for zig project.

TODO:

- [ ] zigmod
- [ ] gyro

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
      - uses: Hanaasagi/zig-action-cache@master
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
