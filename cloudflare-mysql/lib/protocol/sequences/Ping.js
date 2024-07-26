import Sequence, { call } from './Sequence';
import { inherits } from 'node:util';
import { ComPingPacket } from '../packets';

export default Ping;
inherits(Ping, Sequence);

function Ping(options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  call(this, options, callback);
}

Ping.prototype.start = function() {
  this.emit('packet', new ComPingPacket());
};
