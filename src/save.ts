import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { Config, STATE_KEY } from './config';

async function _run(): Promise<void> {
  const config = await Config.new();
  config.printInfo();
  core.info('');

  if (core.getState(STATE_KEY) === config.cacheKey) {
    core.info(`cache is up to date.`);
    return;
  } else {
    core.info(`cache is outdated.`);
  }

  // save a list of files with the specified key
  await cache.saveCache(config.cachePaths, config.cacheKey);
  core.info(`cache saved`);
}

async function run(): Promise<void> {
  // check the presence of action cache service
  if (!cache.isFeatureAvailable()) {
    return;
  }

  try {
    _run();
  } catch (e) {
    core.error(`unexpected error occurred => ${e}`);
  }
}

run();
