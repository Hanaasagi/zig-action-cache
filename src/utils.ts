import * as core from '@actions/core';
import * as io from '@actions/io';
import fs from 'fs';

import * as exec from '@actions/exec';

export async function getCmdOutput(
  cmd: string,
  args: string[] = [],
  options: exec.ExecOptions = {}
): Promise<string> {
  let stdout = '';
  let stderr = '';
  try {
    await exec.exec(cmd, args, {
      silent: true,
      listeners: {
        stdout(data) {
          stdout += data.toString();
        },
        stderr(data) {
          stderr += data.toString();
        }
      },
      ...options
    });
  } catch (e) {
    core.warning(`Command failed: ${cmd} ${args.join(' ')}`);
    core.warning(`${stderr}`);
    throw e;
  }
  return stdout;
}

export async function rmRF(dirName: string): Promise<void> {
  core.info(`deleting "${dirName}"`);
  await io.rmRF(dirName);
}

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}
