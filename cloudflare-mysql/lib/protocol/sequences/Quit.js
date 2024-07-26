import Sequence, { call, prototype } from './Sequence';
import { inherits } from 'node:util';
import { ComQuitPacket } from '../packets';

export default Quit;
inherits(Quit, Sequence);
function Quit(options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = {};
  }

  call(this, options, callback);

  this._started = false;
}

Quit.prototype.end = function end(err) {
  if (this._ended) {
    return;
  }

  if (!this._started) {
    prototype.end.call(this, err);
    return;
  }

  if (err && err.code === 'ECONNRESET' && err.syscall === 'read') {
    // Ignore read errors after packet sent
    prototype.end.call(this);
    return;
  }

  prototype.end.call(this, err);
};

Quit.prototype.start = function() {
  this._started = true;
  this.emit('packet', new ComQuitPacket());
};
