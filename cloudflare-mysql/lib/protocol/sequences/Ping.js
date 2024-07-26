import Sequence from './Sequence';
import { ComPingPacket } from '../packets';

export default Ping;

class Ping extends Sequence {
  constructor(options, callback) {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    super(options, callback);
  }
  start() {
    this.emit('packet', new ComPingPacket());
  }
}


