import Sequence, { call } from './Sequence';
import { inherits } from 'node:util';
import { AuthSwitchRequestPacket, ErrorPacket, ComChangeUserPacket, AuthSwitchResponsePacket } from '../packets';
import { token, auth } from '../Auth';

export default ChangeUser;
inherits(ChangeUser, Sequence);
function ChangeUser(options, callback) {
  call(this, options, callback);

  this._user          = options.user;
  this._password      = options.password;
  this._database      = options.database;
  this._charsetNumber = options.charsetNumber;
  this._currentConfig = options.currentConfig;
}

ChangeUser.prototype.determinePacket = function determinePacket(firstByte) {
  switch (firstByte) {
    case 0xfe: return AuthSwitchRequestPacket;
    case 0xff: return ErrorPacket;
    default: return undefined;
  }
};

ChangeUser.prototype.start = function(handshakeInitializationPacket) {
  var scrambleBuff = handshakeInitializationPacket.scrambleBuff();

  token(this._password, scrambleBuff).then((scrambleBuff) => {
    var packet = new ComChangeUserPacket({
      user          : this._user,
      scrambleBuff  : scrambleBuff,
      database      : this._database,
      charsetNumber : this._charsetNumber
    });

    this._currentConfig.user          = this._user;
    this._currentConfig.password      = this._password;
    this._currentConfig.database      = this._database;
    this._currentConfig.charsetNumber = this._charsetNumber;

    this.emit('packet', packet);
  });
};

ChangeUser.prototype['AuthSwitchRequestPacket'] = function (packet) {
  var name = packet.authMethodName;
  
  auth(name, packet.authMethodData, {
    password: this._password
  }).then((data) => {
    if (data !== undefined) {
      this.emit('packet', new AuthSwitchResponsePacket({
        data: data
      }));
    } else {
      var err   = new Error('MySQL is requesting the ' + name + ' authentication method, which is not supported.');
      err.code  = 'UNSUPPORTED_AUTH_METHOD';
      err.fatal = true;
      this.end(err);
    }
  });
};

ChangeUser.prototype['ErrorPacket'] = function(packet) {
  var err = this._packetToError(packet);
  err.fatal = true;
  this.end(err);
};
