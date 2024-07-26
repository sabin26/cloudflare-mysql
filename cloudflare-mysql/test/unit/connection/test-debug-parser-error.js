import { ifError, ok, equal, deepEqual } from 'assert';
import { createFakeServer, createConnection, Packets, PacketWriter } from '../../common';
import { format } from 'node:util';

var tid    = 0;
var server = createFakeServer();

server.listen(0, function (err) {
  ifError(err);

  var connection = createConnection({debug: true, port: server.port()});
  var messages   = [];

  console.log = function () {
    var msg = format.apply(this, arguments);
    if (String(msg).indexOf('--') !== -1) {
      messages.push(msg.split(' {')[0]);
    }
  };

  connection.query('SELECT value FROM stuff', function (err) {
    ok(err, 'got error');
    equal(messages.length, 6);
    deepEqual(messages, [
      '<-- HandshakeInitializationPacket',
      '--> (1) ClientAuthenticationPacket',
      '<-- (1) OkPacket',
      '--> (1) ComQueryPacket',
      '<-- (1) ResultSetHeaderPacket',
      '<-- (1) FieldPacket'
    ]);

    connection.destroy();
    server.destroy();
  });
});

server.on('connection', function(conn) {
  conn.handshake({ threadId: ++tid });
  conn.on('query', function(packet) {
    switch (packet.sql) {
      case 'SELECT value FROM stuff':
        this._sendPacket(new Packets.ResultSetHeaderPacket({
          fieldCount: 1
        }));

        var writer = new PacketWriter();
        writer.writeLengthCodedString('def');
        this._socket.write(writer.toBuffer(this._parser));
        this._parser.resetPacketNumber();
        break;
      default:
        this._handlePacketQuery(packet);
        break;
    }
  });
});
