module.exports = PacketHeader;
class PacketHeader {
  constructor(length, number) {
    this.length = length;
    this.number = number;
  }
}
