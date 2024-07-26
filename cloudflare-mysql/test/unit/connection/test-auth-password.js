import { lib, createFakeServer, createConnection } from '../../common';
import { ifError } from 'assert';
var Auth   = require(lib + '/protocol/Auth');


var random = Crypto.pseudoRandomBytes || Crypto.randomBytes; // Depends on node.js version
var server = createFakeServer();

server.listen(0, function(err) {
  ifError(err);

  var connection = createConnection({
    port     : server.port(),
    password : 'passwd'
  });

  connection.connect(function (err) {
    ifError(err);
    connection.destroy();
    server.destroy();
  });
});

server.on('connection', function(incomingConnection) {
  random(20, function (err, scramble) {
    ifError(err);

    incomingConnection.on('clientAuthentication', function (packet) {
      this._sendAuthResponse(packet.scrambleBuff, Auth.token('passwd', scramble));
    });

    incomingConnection.handshake({
      scrambleBuff1 : scramble.slice(0, 8),
      scrambleBuff2 : scramble.slice(8, 20)
    });
  });
});
