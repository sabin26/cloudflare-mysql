export default ResultSet;
class ResultSet {
  constructor(resultSetHeaderPacket) {
    this.resultSetHeaderPacket = resultSetHeaderPacket;
    this.fieldPackets = [];
    this.eofPackets = [];
    this.rows = [];
  }
}
