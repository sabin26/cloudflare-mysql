export default Timer;
class Timer {
  constructor(object) {
    this._object = object;
    this._timeout = null;
    this.msecs = 0;
  }
  active() {
    if (this._timeout) {
      if (this._timeout.refresh) {
        this._timeout.refresh();
      } else {
        this.start(this.msecs);
      }
    }
  }
  start(msecs) {
    this.stop();

    this.msecs = msecs;

    if (msecs)
      this._timeout = setTimeout(this._onTimeout.bind(this), msecs);
  }
  stop() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }
  _onTimeout() {
    return this._object._onTimeout();
  }
}





