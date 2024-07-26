import { ifError, equal, deepEqual } from 'assert';
import { createFakeServer, createConnection } from '../../common';
import { format } from 'node:util';

var tid    = 0;
var server = createFakeServer();

server.listen(0, function (err) {
  ifError(err);

  var connection = createConnection({
    debug : ['OkPacket', 'ComPingPacket'],
    port  : server.port()
  });
  var messages   = [];

  console.log = function () {
    var msg = format.apply(this, arguments);
    if (String(msg).indexOf('--') !== -1) {
      messages.push(msg.split(' {')[0]);
    }
  };

  connection.ping(function (err) {
    ifError(err);
    equal(messages.length, 3);
    deepEqual(messages, [
      '<-- (1) OkPacket',
      '--> (1) ComPingPacket',
      '<-- (1) OkPacket'
    ]);

    connection.destroy();
    server.destroy();
  });
});

server.on('connection', function (conn) {
  conn.handshake({ threadId: ++tid });
});
