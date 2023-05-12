// https://github.com/actions/cache
import * as cache from '@actions/cache';
// https://github.com/actions/toolkit/tree/main/packages/core
import * as core from '@actions/core';

import { Config, STATE_KEY } from './config';
import { exists, rmRF } from './utils';

function setCacheHitOutput(cacheHit: boolean): void {
  core.setOutput('cache-hit', cacheHit.toString());
}

async function _run(): Promise<void> {
  const cacheOnFailure =
    core.getInput('cache-on-failure').toLowerCase() === 'true' ? true : false;

  core.exportVariable('CACHE_ON_FAILURE', cacheOnFailure);

  const config = await Config.new();
  config.printInfo();
  core.info('');

  core.info(`Restoring cache ...`);
  // Restores cache from keys
  const cacheHitKey = await cache.restoreCache(
    config.cachePaths,
    config.cacheKey,
    [config.restoreKey]
  );

  if (cacheHitKey) {
    core.info(`Restored from cache key "${cacheHitKey}".`);
    // saves state for current action,
    // the state can only be retrieved by this action's post job execution.
    core.saveState(STATE_KEY, cacheHitKey);

    // cache mismatch, clean
    if (cacheHitKey !== config.cacheKey) {
      core.info('Cache mismatch, cleaning cache.');
      for (const path of config.cachePaths) {
        if (await exists(path)) {
          await rmRF(path);
        }
      }
    }

    setCacheHitOutput(cacheHitKey === config.cacheKey);
  } else {
    core.info('No cache found.');

    setCacheHitOutput(false);
  }
}

async function run(): Promise<void> {
  // check the presence of action cache service
  if (!cache.isFeatureAvailable()) {
    setCacheHitOutput(false);
    return;
  }

  try {
    _run();
  } catch (e) {
    setCacheHitOutput(false);
    core.error(`unexpected error occurred => ${e}`);
  }
}

run();
