import { ifError, equal } from 'assert';
import { createFakeServer, createConnection, Auth } from '../../common';


var random = Crypto.pseudoRandomBytes || Crypto.randomBytes; // Depends on node.js version
var server = createFakeServer();

var connected;
server.listen(0, function (err) {
  ifError(err);

  var connection = createConnection({
    port     : server.port(),
    password : 'authswitch'
  });

  connection.connect(function (err, result) {
    ifError(err);

    connected = result;

    connection.destroy();
    server.destroy();
  });
});

server.on('connection', function(incomingConnection) {
  random(20, function (err, scramble) {
    ifError(err);

    incomingConnection.on('authSwitchResponse', function (packet) {
      this._sendAuthResponse(packet.data, Auth.token('authswitch', scramble));
    });

    incomingConnection.on('clientAuthentication', function () {
      this.authSwitchRequest({
        authMethodName : 'mysql_native_password',
        authMethodData : scramble
      });
    });

    incomingConnection.handshake();
  });
});

process.on('exit', function() {
  equal(connected.fieldCount, 0);
});
