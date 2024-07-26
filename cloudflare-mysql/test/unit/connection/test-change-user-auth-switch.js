import { ifError, strictEqual } from 'assert';

import { createFakeServer, createConnection, Auth } from '../../common';

var random = Crypto.pseudoRandomBytes || Crypto.randomBytes; // Depends on node.js version
var server = createFakeServer();

server.listen(0, function(err) {
  ifError(err);

  var connection = createConnection({
    port     : server.port(),
    user     : 'user_1',
    password : 'pass_1'
  });

  connection.query('SELECT CURRENT_USER()', function (err, result) {
    ifError(err);
    strictEqual(result[0]['CURRENT_USER()'], 'user_1@localhost');

    connection.changeUser({user: 'user_2', password: 'pass_2'}, function (err) {
      ifError(err);
      connection.destroy();
      server.destroy();
    });
  });
});

server.on('connection', function (incomingConnection) {
  random(20, function (err, scramble) {
    ifError(err);

    incomingConnection.on('authSwitchResponse', function (packet) {
      this._sendAuthResponse(packet.data, Auth.token('pass_2', scramble));
    });

    incomingConnection.on('changeUser', function () {
      this.authSwitchRequest({
        authMethodName : 'mysql_native_password',
        authMethodData : scramble
      });
    });

    incomingConnection.handshake();
  });
});
