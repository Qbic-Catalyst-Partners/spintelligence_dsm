const fs = require('fs');
const path = require('path');
const util = require('util');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'backend.log');

fs.mkdirSync(LOG_DIR, { recursive: true });

const stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

const formatValue = (value) => {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  return util.inspect(value, { depth: null, colors: false });
};

const writeLog = (level, args) => {
  const timestamp = new Date().toISOString();
  const message = args.map(formatValue).join(' ');
  stream.write(`[${timestamp}] [${level}] ${message}\n`);
};

const wrapConsole = (method, level) => {
  const original = console[method].bind(console);
  console[method] = (...args) => {
    writeLog(level, args);
    original(...args);
  };
};

wrapConsole('log', 'INFO');
wrapConsole('info', 'INFO');
wrapConsole('warn', 'WARN');
wrapConsole('error', 'ERROR');

module.exports = {
  LOG_DIR,
  LOG_FILE,
};
