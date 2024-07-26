import Sequence from './Sequence';
import { ErrorPacket, HandshakeInitializationPacket, UseOldPasswordPacket, AuthSwitchRequestPacket, AuthSwitchResponsePacket, SSLRequestPacket, ClientAuthenticationPacket, OldPasswordPacket } from '../packets';
import { auth, token, scramble323 } from '../Auth';
import { CLIENT_SSL } from '../constants/client';

export default Handshake;
class Handshake extends Sequence {
  constructor(options, callback) {
    super(options, callback);

    options = options || {};

    this._config = options.config;
    this._handshakeInitializationPacket = null;
  }
  determinePacket(firstByte, parser) {
    if (firstByte === 0xff) {
      return ErrorPacket;
    }

    if (!this._handshakeInitializationPacket) {
      return HandshakeInitializationPacket;
    }

    if (firstByte === 0xfe) {
      return (parser.packetLength() === 1)
        ? UseOldPasswordPacket
        : AuthSwitchRequestPacket;
    }

    return undefined;
  }
  AuthSwitchRequestPacket(packet) {
    var name = packet.authMethodName;
    auth(name, packet.authMethodData, {
      password: this._config.password
    }).then((data) => {
      if (data !== undefined) {
        this.emit('packet', new AuthSwitchResponsePacket({
          data: data
        }));
      } else {
        var err = new Error('MySQL is requesting the ' + name + ' authentication method, which is not supported.');
        err.code = 'UNSUPPORTED_AUTH_METHOD';
        err.fatal = true;
        this.end(err);
      }
    });
  }
  HandshakeInitializationPacket(packet) {
    this._handshakeInitializationPacket = packet;

    this._config.protocol41 = packet.protocol41;

    var serverSSLSupport = packet.serverCapabilities1 & CLIENT_SSL;

    if (this._config.ssl) {
      if (!serverSSLSupport) {
        var err = new Error('Server does not support secure connection');

        err.code = 'HANDSHAKE_NO_SSL_SUPPORT';
        err.fatal = true;

        this.end(err);
        return;
      }

      this._config.clientFlags |= CLIENT_SSL;
      this.emit('packet', new SSLRequestPacket({
        clientFlags: this._config.clientFlags,
        maxPacketSize: this._config.maxPacketSize,
        charsetNumber: this._config.charsetNumber
      }));
      this.emit('start-tls');
    } else {
      this._sendCredentials();
    }
  }
  _tlsUpgradeCompleteHandler() {
    this._sendCredentials();
  }
  _sendCredentials() {
    var packet = this._handshakeInitializationPacket;

    if (packet.protocol41) {
      token(this._config.password, packet.scrambleBuff()).then((scrambleBuffer) => {
        this.emit('packet', new ClientAuthenticationPacket({
          clientFlags: this._config.clientFlags,
          maxPacketSize: this._config.maxPacketSize,
          charsetNumber: this._config.charsetNumber,
          user: this._config.user,
          database: this._config.database,
          protocol41: packet.protocol41,
          scrambleBuff: scrambleBuffer
        }));
      });
    }
    else {
      this.emit('packet', new ClientAuthenticationPacket({
        clientFlags: this._config.clientFlags,
        maxPacketSize: this._config.maxPacketSize,
        charsetNumber: this._config.charsetNumber,
        user: this._config.user,
        database: this._config.database,
        protocol41: packet.protocol41,
        scrambleBuff: scramble323(packet.scrambleBuff(), this._config.password)
      }));
    }
  }
  UseOldPasswordPacket() {
    if (!this._config.insecureAuth) {
      var err = new Error(
        'MySQL server is requesting the old and insecure pre-4.1 auth mechanism. ' +
        'Upgrade the user password or use the {insecureAuth: true} option.'
      );

      err.code = 'HANDSHAKE_INSECURE_AUTH';
      err.fatal = true;

      this.end(err);
      return;
    }

    this.emit('packet', new OldPasswordPacket({
      scrambleBuff: scramble323(this._handshakeInitializationPacket.scrambleBuff(), this._config.password)
    }));
  }
  ErrorPacket(packet) {
    var err = this._packetToError(packet, true);
    err.fatal = true;
    this.end(err);
  }
}








