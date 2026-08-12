'use strict';

const fs = require('fs');
const path = require('path');

function fallbackValue(value) {
  return typeof value === 'function' ? value() : value;
}

function backupInvalidFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const backupPath = `${filePath}.corrupt-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  return backupPath;
}

function readJsonFile(filePath, { fallback = null, label = 'JSON data', logger = console } = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallbackValue(fallback);
    let backupPath = '';
    try {
      backupPath = backupInvalidFile(filePath);
    } catch (backupError) {
      logger.warn(`${label} backup failed: ${backupError.message}`);
    }
    logger.warn(`${label} load failed: ${error.message}${backupPath ? `; preserved at ${backupPath}` : ''}`);
    return fallbackValue(fallback);
  }
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fileDescriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try { fs.closeSync(fileDescriptor); } catch (closeError) { /* ignore cleanup failure */ }
    }
    try { fs.unlinkSync(tempPath); } catch (cleanupError) { /* ignore missing temp file */ }
    throw error;
  }
}

module.exports = { readJsonFile, writeJsonAtomic };
