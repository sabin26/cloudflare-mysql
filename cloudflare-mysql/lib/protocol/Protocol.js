import Parser from "./Parser";
import * as Sequences from "./sequences";
import Packets from "./packets";
import PacketWriter from "./PacketWriter";

import Stream from "./../../../cloudflare-stream-polyfill";

export default class Protocol extends Stream {
  constructor (options) {
    super();

    options = options || {};

    this.readable = true;
    this.writable = true;

    this._config                        = options.config || {};
    this._connection                    = options.connection;
    this._callback                      = null;
    this._fatalError                    = null;
    this._quitSequence                  = null;
    this._handshake                     = false;
    this._handshaked                    = false;
    this._ended                         = false;
    this._destroyed                     = false;
    this._queue                         = [];
    this._handshakeInitializationPacket = null;

    this._parser = new Parser({
      onError  : this.handleParserError.bind(this),
      onPacket : this._parsePacket.bind(this),
      config   : this._config
    });
  }

  write(buffer) {
    this._parser.write(buffer);
    return true;
  };

  handshake(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = options || {};
    options.config = this._config;

    var sequence = this._enqueue(new Sequences.Handshake(options, callback));

    this._handshake = true;

    return sequence;
  };

  query(options, callback) {
    return this._enqueue(new Sequences.Query(options, callback));
  };

  changeUser(options, callback) {
    return this._enqueue(new Sequences.ChangeUser(options, callback));
  };

  ping(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    return this._enqueue(new Sequences.Ping(options, callback));
  };

  stats(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    return this._enqueue(new Sequences.Statistics(options, callback));
  };

  quit(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    var self     = this;
    var sequence = this._enqueue(new Sequences.Quit(options, callback));

    sequence.on('end', function () {
      self.end();
    });

    return this._quitSequence = sequence;
  };

  end() {
    if (this._ended) {
      return;
    }
    this._ended = true;

    if (this._quitSequence && (this._quitSequence._ended || this._queue[0] === this._quitSequence)) {
      this._quitSequence.end();
      this.emit('end');
      return;
    }

    var err = new Error('Connection lost: The server closed the connection.');
    err.fatal = true;
    err.code = 'PROTOCOL_CONNECTION_LOST';

    this._delegateError(err);
  };

  pause() {
    this._parser.pause();
    // Since there is a file stream in query, we must transmit pause/resume event to current sequence.
    var seq = this._queue[0];
    if (seq && seq.emit) {
      seq.emit('pause');
    }
  };

  resume() {
    this._parser.resume();
    // Since there is a file stream in query, we must transmit pause/resume event to current sequence.
    var seq = this._queue[0];
    if (seq && seq.emit) {
      seq.emit('resume');
    }
  };

  _enqueue(sequence) {
    if (!this._validateEnqueue(sequence)) {
      return sequence;
    }

    if (this._config.trace) {
      // Long stack trace support
      sequence._callSite = sequence._callSite || new Error();
    }

    this._queue.push(sequence);
    this.emit('enqueue', sequence);

    var self = this;
    sequence
      .on('error', function(err) {
        self._delegateError(err, sequence);
      })
      .on('packet', function(packet) {
        sequence._timer.active();
        self._emitPacket(packet);
      })
      .on('timeout', function() {
        var err = new Error(sequence.constructor.name + ' inactivity timeout');

        err.code    = 'PROTOCOL_SEQUENCE_TIMEOUT';
        err.fatal   = true;
        err.timeout = sequence._timeout;

        self._delegateError(err, sequence);
      });

    if (sequence.constructor === Sequences.Handshake) {
      sequence.on('start-tls', function () {
        sequence._timer.active();
        self._connection._startTLS(function(err) {
          if (err) {
            // SSL negotiation error are fatal
            err.code  = 'HANDSHAKE_SSL_ERROR';
            err.fatal = true;
            sequence.end(err);
            return;
          }

          sequence._timer.active();
          sequence._tlsUpgradeCompleteHandler();
        });
      });

      sequence.on('end', function () {
        self._handshaked = true;

        if (!self._fatalError) {
          self.emit('handshake', self._handshakeInitializationPacket);
        }
      });
    }

    sequence.on('end', function () {
      self._dequeue(sequence);
    });

    if (this._queue.length === 1) {
      this._parser.resetPacketNumber();
      this._startSequence(sequence);
    }

    return sequence;
  };

  _validateEnqueue(sequence) {
    var err;
    var prefix = 'Cannot enqueue ' + sequence.constructor.name;

    if (this._fatalError) {
      err      = new Error(prefix + ' after fatal error.');
      err.code = 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR';
    } else if (this._quitSequence) {
      err      = new Error(prefix + ' after invoking quit.');
      err.code = 'PROTOCOL_ENQUEUE_AFTER_QUIT';
    } else if (this._destroyed) {
      err      = new Error(prefix + ' after being destroyed.');
      err.code = 'PROTOCOL_ENQUEUE_AFTER_DESTROY';
    } else if ((this._handshake || this._handshaked) && sequence.constructor === Sequences.Handshake) {
      err      = new Error(prefix + ' after already enqueuing a Handshake.');
      err.code = 'PROTOCOL_ENQUEUE_HANDSHAKE_TWICE';
    } else {
      return true;
    }

    var self  = this;
    err.fatal = false;

    // add error handler
    sequence.on('error', function (err) {
      self._delegateError(err, sequence);
    });

    process.nextTick(function () {
      sequence.end(err);
    });

    return false;
  };

  _parsePacket() {
    var sequence = this._queue[0];

    if (!sequence) {
      var err   = new Error('Received packet with no active sequence.');
      err.code  = 'PROTOCOL_STRAY_PACKET';
      err.fatal = true;

      this._delegateError(err);
      return;
    }

    var Packet     = this._determinePacket(sequence);
    var packet     = new Packet({protocol41: this._config.protocol41});
    var packetName = Packet.name;

    // Special case: Faster dispatch, and parsing done inside sequence
    if (Packet === Packets.RowDataPacket) {
      sequence.RowDataPacket(packet, this._parser, this._connection);

      if (this._config.debug) {
        this._debugPacket(true, packet);
      }

      return;
    }

    if (this._config.debug) {
      this._parsePacketDebug(packet);
    } else {
      packet.parse(this._parser);
    }

    if (Packet === Packets.HandshakeInitializationPacket) {
      this._handshakeInitializationPacket = packet;
      this.emit('initialize', packet);
    }

    sequence._timer.active();

    if (!sequence[packetName]) {
      var err   = new Error('Received packet in the wrong sequence.');
      err.code  = 'PROTOCOL_INCORRECT_PACKET_SEQUENCE';
      err.fatal = true;

      this._delegateError(err);
      return;
    }

    sequence[packetName](packet);
  };

  _parsePacketDebug(packet) {
    try {
      packet.parse(this._parser);
    } finally {
      this._debugPacket(true, packet);
    }
  };

    _emitPacket(packet) {
    var packetWriter = new PacketWriter();
    packet.write(packetWriter);
    this.emit('data', packetWriter.toBuffer(this._parser));

    if (this._config.debug) {
      this._debugPacket(false, packet);
    }
  };

  _determinePacket(sequence) {
    var firstByte = this._parser.peak();

    if (sequence.determinePacket) {
      var Packet = sequence.determinePacket(firstByte, this._parser);
      if (Packet) {
        return Packet;
      }
    }

    switch (firstByte) {
      case 0x00: return Packets.OkPacket;
      case 0xfe: return Packets.EofPacket;
      case 0xff: return Packets.ErrorPacket;
    }

    throw new Error('Could not determine packet, firstByte = ' + firstByte);
  };

  _dequeue(sequence) {
    sequence._timer.stop();

    // No point in advancing the queue, we are dead
    if (this._fatalError) {
      return;
    }

    this._queue.shift();

    var sequence = this._queue[0];
    if (!sequence) {
      this.emit('drain');
      return;
    }

    this._parser.resetPacketNumber();

    this._startSequence(sequence);
  };

  _startSequence(sequence) {
    if (sequence._timeout > 0 && isFinite(sequence._timeout)) {
      sequence._timer.start(sequence._timeout);
    }

    if (sequence.constructor === Sequences.ChangeUser) {
      sequence.start(this._handshakeInitializationPacket);
    } else {
      sequence.start();
    }
  };

  handleNetworkError(err) {
    err.fatal = true;

    var sequence = this._queue[0];
    if (sequence) {
      sequence.end(err);
    } else {
      this._delegateError(err);
    }
  };

  handleParserError(err) {
    var sequence = this._queue[0];
    if (sequence) {
      sequence.end(err);
    } else {
      this._delegateError(err);
    }
  };

  _delegateError(err, sequence) {
    // Stop delegating errors after the first fatal error
    if (this._fatalError) {
      return;
    }

    if (err.fatal) {
      this._fatalError = err;
    }

    if (this._shouldErrorBubbleUp(err, sequence)) {
      // Can't use regular 'error' event here as that always destroys the pipe
      // between socket and protocol which is not what we want (unless the
      // exception was fatal).
      this.emit('unhandledError', err);
    } else if (err.fatal) {
      // Send fatal error to all sequences in the queue
      var queue = this._queue;
      process.nextTick(function () {
        queue.forEach(function (sequence) {
          sequence.end(err);
        });
        queue.length = 0;
      });
    }

    // Make sure the stream we are piping to is getting closed
    if (err.fatal) {
      this.emit('end', err);
    }
  };

  _shouldErrorBubbleUp(err, sequence) {
    if (sequence) {
      if (sequence.hasErrorHandler()) {
        return false;
      } else if (!err.fatal) {
        return true;
      }
    }

    return (err.fatal && !this._hasPendingErrorHandlers());
  };

  _hasPendingErrorHandlers() {
    return this._queue.some(function(sequence) {
      return sequence.hasErrorHandler();
    });
  };

  destroy() {
    this._destroyed = true;
    this._parser.pause();

    if (this._connection.state !== 'disconnected') {
      if (!this._ended) {
        this.end();
      }
    }
  };

  _debugPacket(incoming, packet) {
    var connection = this._connection;
    var direction  = incoming
      ? '<--'
      : '-->';
    var packetName = packet.constructor.name;
    var threadId   = connection && connection.threadId !== null
      ? ' (' + connection.threadId + ')'
      : '';

    // check for debug packet restriction
    if (Array.isArray(this._config.debug) && this._config.debug.indexOf(packetName) === -1) {
      return;
    }

    var packetPayload = String(packet).replace(/^[^{]+/, '');
  };
};
