import Sequence from './Sequence';
import { ComQuitPacket } from '../packets';

export default Quit;
class Quit extends Sequence {
  constructor(options, callback) {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    super(options, callback);

    this._started = false;
  }
  end(err) {
    if (this._ended) {
      return;
    }

    if (!this._started) {
      Sequence.prototype.end.call(this, err);
      return;
    }

    if (err && err.code === 'ECONNRESET' && err.syscall === 'read') {
      // Ignore read errors after packet sent
      Sequence.prototype.end.call(this);
      return;
    }

   Sequence.prototype.end.call(this, err);
  }
  start() {
    this._started = true;
    this.emit('packet', new ComQuitPacket());
  }
}
