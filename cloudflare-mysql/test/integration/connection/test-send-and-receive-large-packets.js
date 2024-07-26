import { ifError, equal } from 'assert';
import { getTestConnection, createConnection, useTestDb, skipTest } from '../../common';


getTestConnection(function (err, connection) {
  ifError(err);

  getMaxAllowedPacket(connection);
});

var oldMaxAllowedPacket;
function getMaxAllowedPacket(connection) {
  connection.query('SHOW VARIABLES WHERE Variable_name = ?', ['max_allowed_packet'], function (err, rows) {
    ifError(err);

    oldMaxAllowedPacket = Number(rows[0].Value);

    increaseMaxAllowedPacketIfNeeded(connection);
  });
}

function increaseMaxAllowedPacketIfNeeded(connection) {
  // Our test generates a SQL query a few bytes larger than 16 MB, but lets
  // leave a little margin:
  var minMaxAllowedPacket = 20 * 1024 * 1024;

  var newMaxAllowedPacket = (oldMaxAllowedPacket < minMaxAllowedPacket)
    ? minMaxAllowedPacket
    : oldMaxAllowedPacket;

  connection.query('SET GLOBAL max_allowed_packet = ?', [newMaxAllowedPacket], function (err) {
    ifError(err);

    // We need to re-connect for this change to take effect, bah
    connection.end();
    connection = createConnection();

    // We need to wait for the re-connect to happen before starting the actual
    // test. That's because our buffer to hex shim in 0.4.x takes ~12 sec on
    // CI, causing a MySQL connection timeout otherwise.
    connection.connect(function (err) {
      ifError(err);

      triggerLargeQueryAndResponsePackets(connection);
    });
  });
}

var length = (Math.pow(256, 3) / 2) + 10; // Half, because of hex encoding
var random = crypto.pseudoRandomBytes || crypto.randomBytes; // Depends on node.js version
var table  = 'large_packet_test';

function triggerLargeQueryAndResponsePackets(connection) {
  random(length, function (err, buf) {
    ifError(err);
    equal(buf.length, length);

    useTestDb(connection);

    connection.query([
      'CREATE TEMPORARY TABLE ?? (',
      '`id` int(11) unsigned NOT NULL AUTO_INCREMENT,',
      '`bb` longblob NOT NULL,',
      'PRIMARY KEY (`id`)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8'
    ].join('\n'), [table], ifError);

    connection.query('INSERT INTO ?? SET ?', [table, {bb: buf}], function (err) {
      if (err && err.code === 'ER_TOO_BIG_ROWSIZE') {
        skipTest('storage engine unable to store ' + buf.length + ' byte blob value');
      }

      ifError(err);
    });

    connection.query('SELECT `id`, `bb` FROM ??', [table], function (err, rows) {
      ifError(err);

      connection.query('SET GLOBAL max_allowed_packet = ?', [oldMaxAllowedPacket], ifError);
      connection.end(function (err) {
        ifError(err);
        equal(rows.length, 1);
        equal(rows[0].bb.length, buf.length);
        equal(rows[0].bb.toString('base64'), buf.toString('base64'));
      });
    });
  });
}
