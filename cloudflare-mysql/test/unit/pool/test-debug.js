import { ifError, equal, deepEqual } from 'assert';
import { createFakeServer, createPool } from '../../common';
import { format } from 'node:util';

var tid    = 0;
var server = createFakeServer();

server.listen(0, function (err) {
  ifError(err);

  var messages = [];
  var pool     = createPool({debug: true, port: server.port()});

  console.log = function () {
    var msg = format.apply(this, arguments);
    if (String(msg).indexOf('--') !== -1) {
      messages.push(msg.split(' {')[0]);
    }
  };

  pool.getConnection(function (err, conn1) {
    ifError(err);
    conn1.query('SELECT 1', function (err) {
      ifError(err);
      pool.getConnection(function (err, conn2) {
        ifError(err);
        conn2.query('SELECT 1', function (err) {
          ifError(err);
          conn1.release();
          conn2.release();
          pool.end(function (err) {
            ifError(err);
            equal(messages.length, 20);
            deepEqual(messages, [
              '<-- HandshakeInitializationPacket',
              '--> (1) ClientAuthenticationPacket',
              '<-- (1) OkPacket',
              '--> (1) ComQueryPacket',
              '<-- (1) ResultSetHeaderPacket',
              '<-- (1) FieldPacket',
              '<-- (1) EofPacket',
              '<-- (1) RowDataPacket',
              '<-- (1) EofPacket',
              '<-- HandshakeInitializationPacket',
              '--> (2) ClientAuthenticationPacket',
              '<-- (2) OkPacket',
              '--> (2) ComQueryPacket',
              '<-- (2) ResultSetHeaderPacket',
              '<-- (2) FieldPacket',
              '<-- (2) EofPacket',
              '<-- (2) RowDataPacket',
              '<-- (2) EofPacket',
              '--> (1) ComQuitPacket',
              '--> (2) ComQuitPacket'
            ]);

            server.destroy();
          });
        });
      });
    });
  });
});

server.on('connection', function (conn) {
  conn.handshake({ threadId: ++tid });
});
