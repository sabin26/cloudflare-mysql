import { CLIENT_LOCAL_FILES } from '../constants/client';
import { createReadStream } from 'node:fs';
import { ComQueryPacket, OkPacket, LocalInfileRequestPacket, ErrorPacket, ResultSetHeaderPacket, FieldPacket, EofPacket, RowDataPacket, EmptyPacket, LocalDataFilePacket } from '../packets';
import ResultSet from '../ResultSet';
import Sequence, { call } from './Sequence';
import { SERVER_MORE_RESULTS_EXISTS } from '../constants/server_status';
import Readable from 'readable-stream';
import { inherits } from 'node:util';

export default Query;
inherits(Query, Sequence);
class Query {
  constructor(options, callback) {
    call(this, options, callback);

    this.sql = options.sql;
    this.values = options.values;
    this.typeCast = (options.typeCast === undefined)
      ? true
      : options.typeCast;
    this.nestTables = options.nestTables || false;

    this._resultSet = null;
    this._results = [];
    this._fields = [];
    this._index = 0;
    this._loadError = null;
  }
  start() {
    this.emit('packet', new ComQueryPacket(this.sql));
  }
  determinePacket(byte, parser) {
    var resultSet = this._resultSet;

    if (!resultSet) {
      switch (byte) {
        case 0x00: return OkPacket;
        case 0xfb: return LocalInfileRequestPacket;
        case 0xff: return ErrorPacket;
        default: return ResultSetHeaderPacket;
      }
    }

    if (resultSet.eofPackets.length === 0) {
      return (resultSet.fieldPackets.length < resultSet.resultSetHeaderPacket.fieldCount)
        ? FieldPacket
        : EofPacket;
    }

    if (byte === 0xff) {
      return ErrorPacket;
    }

    if (byte === 0xfe && parser.packetLength() < 9) {
      return EofPacket;
    }

    return RowDataPacket;
  }
  OkPacket(packet) {
    // try...finally for exception safety
    try {
      if (!this._callback) {
        this.emit('result', packet, this._index);
      } else {
        this._results.push(packet);
        this._fields.push(undefined);
      }
    } finally {
      this._index++;
      this._resultSet = null;
      this._handleFinalResultPacket(packet);
    }
  }
  ErrorPacket(packet) {
    var err = this._packetToError(packet);

    var results = (this._results.length > 0)
      ? this._results
      : undefined;

    var fields = (this._fields.length > 0)
      ? this._fields
      : undefined;

    err.index = this._index;
    err.sql = this.sql;

    this.end(err, results, fields);
  }
  LocalInfileRequestPacket(packet) {
    if (this._connection.config.clientFlags & CLIENT_LOCAL_FILES) {
      this._sendLocalDataFile(packet.filename);
    } else {
      this._loadError = new Error('Load local files command is disabled');
      this._loadError.code = 'LOCAL_FILES_DISABLED';
      this._loadError.fatal = false;

      this.emit('packet', new EmptyPacket());
    }
  }
  ResultSetHeaderPacket(packet) {
    this._resultSet = new ResultSet(packet);
  }
  FieldPacket(packet) {
    this._resultSet.fieldPackets.push(packet);
  }
  EofPacket(packet) {
    this._resultSet.eofPackets.push(packet);

    if (this._resultSet.eofPackets.length === 1 && !this._callback) {
      this.emit('fields', this._resultSet.fieldPackets, this._index);
    }

    if (this._resultSet.eofPackets.length !== 2) {
      return;
    }

    if (this._callback) {
      this._results.push(this._resultSet.rows);
      this._fields.push(this._resultSet.fieldPackets);
    }

    this._index++;
    this._resultSet = null;
    this._handleFinalResultPacket(packet);
  }
  _handleFinalResultPacket(packet) {
    if (packet.serverStatus & SERVER_MORE_RESULTS_EXISTS) {
      return;
    }

    var results = (this._results.length > 1)
      ? this._results
      : this._results[0];

    var fields = (this._fields.length > 1)
      ? this._fields
      : this._fields[0];

    this.end(this._loadError, results, fields);
  }
  RowDataPacket(packet, parser, connection) {
    packet.parse(parser, this._resultSet.fieldPackets, this.typeCast, this.nestTables, connection);

    if (this._callback) {
      this._resultSet.rows.push(packet);
    } else {
      this.emit('result', packet, this._index);
    }
  }
  _sendLocalDataFile(path) {
    var self = this;
    var localStream = createReadStream(path, {
      flag: 'r',
      encoding: null,
      autoClose: true
    });

    this.on('pause', function () {
      localStream.pause();
    });

    this.on('resume', function () {
      localStream.resume();
    });

    localStream.on('data', function (data) {
      self.emit('packet', new LocalDataFilePacket(data));
    });

    localStream.on('error', function (err) {
      self._loadError = err;
      localStream.emit('end');
    });

    localStream.on('end', function () {
      self.emit('packet', new EmptyPacket());
    });
  }
  stream(options) {
    var self = this;

    options = options || {};
    options.objectMode = true;

    var stream = new Readable(options);

    stream._read = function () {
      self._connection && self._connection.resume();
    };

    stream.once('end', function () {
      process.nextTick(function () {
        stream.emit('close');
      });
    });

    this.on('result', function (row, i) {
      if (!stream.push(row)) self._connection.pause();
      stream.emit('result', row, i); // replicate old emitter
    });

    this.on('error', function (err) {
      stream.emit('error', err); // Pass on any errors
    });

    this.on('end', function () {
      stream.push(null); // pushing null, indicating EOF
    });

    this.on('fields', function (fields, i) {
      stream.emit('fields', fields, i); // replicate old emitter
    });

    return stream;
  }
}













