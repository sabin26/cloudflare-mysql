import Sequence from './Sequence';
import { ComStatisticsPacket, StatisticsPacket } from '../packets';

export default Statistics;
class Statistics extends Sequence {
  constructor(options, callback) {
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }

    Sequence.call(this, options, callback);
  }
  start() {
    this.emit('packet', new ComStatisticsPacket());
  }
  StatisticsPacket(packet) {
    this.end(null, packet);
  }
  determinePacket(firstByte) {
    if (firstByte === 0x55) {
      return StatisticsPacket;
    }

    return undefined;
  }
}




