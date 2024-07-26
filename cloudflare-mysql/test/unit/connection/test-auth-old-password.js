import { lib, createFakeServer, createConnection, Packets } from '../../common';
import { ifError } from 'assert';
var Auth   = require(lib + '/protocol/Auth');


var random = Crypto.pseudoRandomBytes || Crypto.randomBytes; // Depends on node.js version
var server = createFakeServer();

server.listen(0, function (err) {
  ifError(err);

  var connection = createConnection({
    port         : server.port(),
    password     : 'oldpw',
    insecureAuth : true
  });

  connection.connect(function (err) {
    ifError(err);
    connection.destroy();
    server.destroy();
  });
});

server.on('connection', function(incomingConnection) {
  random(8, function (err, scramble) {
    ifError(err);

    incomingConnection.on('clientAuthentication', function () {
      this._sendPacket(new Packets.UseOldPasswordPacket());
    });

    incomingConnection.on('OldPasswordPacket', function (packet) {
      var expected = Auth.scramble323(scramble, 'oldpw');
      this._sendAuthResponse(packet.scrambleBuff, expected);
    });

    incomingConnection.handshake({
      scrambleBuff1: scramble
    });
  });
});
