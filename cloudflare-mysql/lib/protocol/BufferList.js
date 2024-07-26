
module.exports = BufferList;
class BufferList {
  constructor() {
    this.bufs = [];
    this.size = 0;
  }
  shift() {
    var buf = this.bufs.shift();

    if (buf) {
      this.size -= buf.length;
    }

    return buf;
  }
  push(buf) {
    if (!buf || !buf.length) {
      return;
    }

    this.bufs.push(buf);
    this.size += buf.length;
  }
}



