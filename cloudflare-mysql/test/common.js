
import { readFileSync, writeSync, fsyncSync } from 'node:fs';
import { resolve, join } from 'path';

export const lib      = resolve(__dirname, '..', 'lib');
export const fixtures = resolve(__dirname, 'fixtures');

export const bogusPort     = 47378;
export const bogusPassword = 'INVALID PASSWORD';

export const fakeServerSocket = __dirname + '/fake_server.sock';

export const testDatabase = process.env.MYSQL_DATABASE || 'test';

export const Auth             = require(lib + '/protocol/Auth');
export const Charsets         = require(lib + '/protocol/constants/charsets');
export const ClientConstants  = require(lib + '/protocol/constants/client');
export const Connection       = require(lib + '/Connection');
export const ConnectionConfig = require(lib + '/ConnectionConfig');
export const Errors           = require(lib + '/protocol/constants/errors');
export const Packets          = require(lib + '/protocol/packets');
export const PacketWriter     = require(lib + '/protocol/PacketWriter');
export const Parser           = require(lib + '/protocol/Parser');
export const PoolConfig       = require(lib + '/PoolConfig');
export const PoolConnection   = require(lib + '/PoolConnection');
export const SqlString        = require(lib + '/protocol/SqlString');
export const Types            = require(lib + '/protocol/constants/types');

var Mysql      = require(resolve(lib, '../index'));
import FakeServer from './FakeServer';

export function createConnection(config) {
  return Mysql.createConnection(getTestConfig(config));
}

export const createQuery = Mysql.createQuery;

export function createTestDatabase(connection, callback) {
  var database = testDatabase;

  connection.query('CREATE DATABASE ??', [database], function (err) {
    if (err && err.code !== 'ER_DB_CREATE_EXISTS') {
      callback(err);
      return;
    }

    callback(null, database);
  });
}

export function createPool(config) {
  return Mysql.createPool(extend({}, config, {
    connectionConfig: getTestConfig(config.connectionConfig)
  }));
}

export function createPoolCluster(config) {
  return Mysql.createPoolCluster(config);
}

export function createFakeServer(options) {
  return new FakeServer(extend({}, options));
}

export function detectNewline(path) {
  var newlines = readFileSync(path, 'utf8').match(/(?:\r?\n)/g) || [];
  var crlf = newlines.filter(function (nl) { return nl === '\r\n'; }).length;
  var lf = newlines.length - crlf;

  return crlf > lf ? '\r\n' : '\n';
}

export function extend(dest) {
  for (var i = 1; i < arguments.length; i++) {
    var src = arguments[i];
    for (var key in src) {
      dest[key] = src[key];
    }
  }

  return dest;
}

export function getTestConnection(config, callback) {
  if (!callback && typeof config === 'function') {
    callback = config;
    config = {};
  }

  var connection = createConnection(config);

  connection.connect(function (err) {
    if (err && err.code === 'ECONNREFUSED') {
      if (process.env.CI) {
        throw err;
      }

      skipTest('cannot connect to MySQL server');
    }

    if (err) {
      callback(err);
      return;
    }

    callback(null, connection);
  });
}

export function skipTest(message) {
  var msg = 'skipping - ' + message + '\n';

  try {
    writeSync(process.stdout.fd, msg);
    fsyncSync(process.stdout.fd);
  } catch (e) {
    // Ignore error
  }

  process.exit(0);
}

export function useTestDb(connection) {
  createTestDatabase(connection, function (err) {
    if (err) throw err;
  });

  connection.query('USE ' + testDatabase);
}

export function getTestConfig(config) {
  return extend({
    host       : process.env.MYSQL_HOST,
    port       : process.env.MYSQL_PORT,
    user       : process.env.MYSQL_USER,
    password   : process.env.MYSQL_PASSWORD,
    socketPath : process.env.MYSQL_SOCKET
  }, config);
}

export function getSSLConfig(config) {
  return extend({
    ca   : readFileSync(join(fixtures, 'server.crt'), 'ascii'),
    cert : readFileSync(join(fixtures, 'server.crt'), 'ascii'),
    key  : readFileSync(join(fixtures, 'server.key'), 'ascii')
  }, config);
}
