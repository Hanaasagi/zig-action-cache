import * as core from '@actions/core';

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { getCmdOutput } from './utils';

const HOME = os.homedir();
export const CARGO_HOME = process.env.CARGO_HOME || path.join(HOME, '.cargo');

export const STATE_KEY = 'ZIG_CACHE_KEY';

function parseZigEnv(data: string) {
  try {
    // Before 0.12.0-dev.1124+ec21da0d5, this is a json
    // $ zig env
    // {
    //  "zig_exe": "/usr/bin/zig",
    //  "lib_dir": "/usr/lib/zig",
    //  "std_dir": "/usr/lib/zig/std",
    //  "global_cache_dir": "/home/kumiko/.cache/zig",
    //  "version": "0.10.1",
    //  "target": "x86_64-linux.6.3.1...6.3.1-gnu.2.36"
    // }
    return JSON.parse(data);
  } catch {
    // >> zig env
    // zig_exe=/home/kumiko/zig/zig-linux-x86_64-0.12.0-dev.1124+ec21da0d5/zig
    // lib_dir=lib
    // std_dir=lib/std
    // global_cache_dir=/home/kumiko/.cache/zig
    // version=0.12.0-dev.1124+ec21da0d5
    // target=x86_64-linux.6.5.7...6.5.7-gnu.2.19
    // ZIG_GLOBAL_CACHE_DIR

    const lines = data.trim().split(os.EOL);
    const envInfo = {};

    // Parse each line and populate the object
    lines.forEach(line => {
      //split on first occurance of =
      const envArr = line.split(/=(.+)?/);

      //clean up value, extracting from quotation if necessary
      if (!envArr[1]) envArr[1] = '';
      const val = envArr[1].replace(/^['"]/, '').replace(/['"]$/, '');
      // @ts-ignore
      envInfo[envArr[0]] = val;
    });

    return envInfo;
  }
}

class ZigInfo {
  constructor(
    public version: string,
    public global_cache_dir: string,
    public target: string
  ) { }

  static async new(): Promise<ZigInfo> {
    // $ zig version
    // 0.10.1
    let stdout = await getCmdOutput('zig', ['version']);
    const version = stdout.trim();

    stdout = await getCmdOutput('zig', ['env']);
    const envInfo = parseZigEnv(stdout);

    return new ZigInfo(version, envInfo.global_cache_dir, envInfo.target);
  }
}

enum PackageManager {
  Null = 'null',
  ZigMod = 'zigmod',
  Gyro = 'gyro',
  Builtin = 'builtin' // build.zig.zon
}

export class Config {
  cachePaths: string[] = [];
  cacheKey = '';
  restoreKey = '';
  private keyPrefix = '';
  private keyZigInfo = '';
  private keyEnvs: string[] = [];
  private keyFiles: string[] = [];
  private packageManager: PackageManager = PackageManager.Null;

  static getKeyPrefix(): string {
    const keyParts = [];

    const prefixKey = core.getInput('prefix-key') || 'zig-cache-step-0';
    keyParts.push(prefixKey);

    const sharedKey = core.getInput('shared-key') || '';
    if (sharedKey) {
      keyParts.push(`-${sharedKey}`);
    } else {
      const key = core.getInput('key') || '';
      if (key) {
        keyParts.push(`-${key}`);
      }
      const job = process.env.GITHUB_JOB;
      if (job) {
        keyParts.push(`-${job}`);
      }
    }

    return keyParts.join('|');
  }

  static getRequiredEnvVars(): Map<string, string> {
    const envPrefixes = ['ZIG', 'CC', 'CFLAGS', 'CXX', 'CMAKE'];
    envPrefixes.push(...core.getInput('env-vars').split(/\s+/).filter(Boolean));

    const keyEnvs = new Map();
    for (const [name, value] of Object.entries(process.env)) {
      if (envPrefixes.some(prefix => name.startsWith(prefix)) && value) {
        keyEnvs.set(name, value);
      }
    }

    return keyEnvs;
  }

  static getCachePaths(): string[] {
    const cachePaths = ['zig-cache', '.zig-cache'];
    const cacheDirectories = core.getInput('cache-directories');

    for (const dir of cacheDirectories.trim().split(/\s+/).filter(Boolean)) {
      cachePaths.push(dir);
    }

    // For project that used package manager, only cache deps when they have lockfile,

    // https://github.com/mattnite/gyro
    if (fs.existsSync('gyro.lock')) {
      cachePaths.push('.gyro/');
    }

    // https://github.com/nektro/zigmod/blob/master/docs/deps.zig.md
    if (fs.existsSync('zigmod.lock')) {
      cachePaths.push('.zigmod/');
    }

    // This is part of global cache
    // if (fs.existsSync('build.zig.zon')) {
    //   cachePaths.push('~/.cache/zig/p/');
    // }

    return cachePaths;
  }

  static detectPackageManager(): PackageManager {
    if (fs.existsSync('gyro.zzz')) {
      return PackageManager.Gyro;
    }

    if (fs.existsSync('zig.mod')) {
      return PackageManager.ZigMod;
    }

    if (fs.existsSync('build.zig.zon')) {
      return PackageManager.Builtin;
    }

    return PackageManager.Null;
  }

  static async new(): Promise<Config> {
    const config = new Config();

    // try to detect package manager
    config.packageManager = this.detectPackageManager();

    config.keyPrefix = this.getKeyPrefix();

    const zigInfo = await ZigInfo.new();
    config.keyZigInfo = `${zigInfo.version} ${zigInfo.target}`;

    const envs = this.getRequiredEnvVars();
    config.keyEnvs = Array.from(envs.keys());

    let hasher = crypto.createHash('sha1');
    // 1. put zig info data
    hasher.update(config.keyZigInfo);
    // 2. put envs
    for (const key of Array.from(envs.keys()).sort((a, b) =>
      a.localeCompare(b)
    )) {
      const value = envs.get(key) || '';
      hasher.update(`${key}=${value}`);
    }

    // 3. compute hash
    const hash = hasher.digest('hex');

    config.restoreKey = `${config.keyPrefix}-${hash}`;

    const keyFiles = [];
    for (const file of ['build.zig', 'deps.zig']) {
      if (!fs.existsSync(file)) {
        continue;
      }
      keyFiles.push(file);
    }

    if (config.packageManager === PackageManager.Gyro) {
      for (const file of ['gyro.zzz', 'gyro.lock']) {
        if (!fs.existsSync(file)) {
          continue;
        }
        keyFiles.push(file);
      }
    }
    if (config.packageManager === PackageManager.ZigMod) {
      for (const file of ['zig.mod', 'zigmod.lock']) {
        if (!fs.existsSync(file)) {
          continue;
        }
        keyFiles.push(file);
      }
    }

    if (config.packageManager === PackageManager.Builtin) {
      for (const file of ['build.zig.zon']) {
        if (!fs.existsSync(file)) {
          continue;
        }
        keyFiles.push(file);
      }
    }

    config.keyFiles = keyFiles;

    hasher = crypto.createHash('sha1');
    for (const file of keyFiles) {
      for await (const chunk of fs.createReadStream(file)) {
        hasher.update(chunk);
      }
    }

    config.cacheKey = `${config.restoreKey}-${hasher.digest('hex')}`;

    config.cachePaths = [zigInfo.global_cache_dir, ...this.getCachePaths()];

    return config;
  }

  printInfo(): void {
    core.startGroup('Cache Configuration');
    core.info(`Package Manager:`);
    core.info(`    ${this.packageManager}`);
    core.info(`Cache Paths:`);
    for (const p of this.cachePaths) {
      core.info(`    ${p}`);
    }
    core.info(`Restore Key:`);
    core.info(`    ${this.restoreKey}`);
    core.info(`Cache Key:`);
    core.info(`    ${this.cacheKey}`);
    core.info(`.. Prefix:`);
    core.info(`  - ${this.keyPrefix}`);
    core.info(`.. Environment considered:`);
    core.info(`  - Zig Version: ${this.keyZigInfo}`);
    for (const env of this.keyEnvs) {
      core.info(`  - ${env}`);
    }
    core.info(`.. Build related files considered:`);
    for (const file of this.keyFiles) {
      core.info(`  - ${file}`);
    }
    core.endGroup();
  }
}
