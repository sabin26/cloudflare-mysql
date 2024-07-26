import { ConnectionConfig as _ConnectionConfig, Charsets, ClientConstants } from '../common';
import { createPublicKey } from 'node:crypto';
import test from 'utest';
import { equal, notEqual, ok, doesNotThrow, strictEqual } from 'assert';
var ConnectionConfig = _ConnectionConfig;

test('ConnectionConfig#Constructor', {
  'takes user,pw,host,port,db from url string': function() {
    var url    = 'mysql://myuser:mypass@myhost:3333/mydb';
    var config = new ConnectionConfig(url);

    equal(config.host, 'myhost');
    equal(config.port, 3333);
    equal(config.user, 'myuser');
    equal(config.password, 'mypass');
    equal(config.database, 'mydb');
  },

  'work with password containing colon': function() {
    var url    = 'mysql://myuser:my:pass@myhost:3333/mydb';
    var config = new ConnectionConfig(url);

    equal(config.host, 'myhost');
    equal(config.port, 3333);
    equal(config.user, 'myuser');
    equal(config.password, 'my:pass');
    equal(config.database, 'mydb');
  },

  'allows additional options via url query': function() {
    var url    = 'mysql://myhost/mydb?debug=true&charset=BIG5_CHINESE_CI&timezone=Z';
    var config = new ConnectionConfig(url);

    equal(config.host, 'myhost');
    equal(config.port, 3306);
    equal(config.database, 'mydb');
    equal(config.debug, true);
    equal(config.charsetNumber, Charsets.BIG5_CHINESE_CI);
    equal(config.timezone, 'Z');
  },

  'accepts client flags': function() {
    var config = new ConnectionConfig({ flags: '-FOUND_ROWS' });
    equal(config.clientFlags & ClientConstants.CLIENT_FOUND_ROWS, 0);
  },

  'accepts multiple client flags': function() {
    var config = new ConnectionConfig({ flags: '-FOUND_ROWS,+IGNORE_SPACE' });
    equal(config.clientFlags & ClientConstants.CLIENT_FOUND_ROWS, 0);
    notEqual(config.clientFlags & ClientConstants.CLIENT_IGNORE_SPACE, 0);
  },

  'ignores unknown client flags': function() {
    var config1 = new ConnectionConfig({});
    var config2 = new ConnectionConfig({ flags: '+HAPPY_MYSQL' });
    equal(config1.clientFlags, config2.clientFlags);
  },

  'ignores empty client flags': function() {
    var config = new ConnectionConfig({ flags: ',-FOUND_ROWS,,+IGNORE_SPACE' });
    equal(config.clientFlags & ClientConstants.CLIENT_FOUND_ROWS, 0);
    notEqual(config.clientFlags & ClientConstants.CLIENT_IGNORE_SPACE, 0);
  },

  'blacklists unsupported client flags': function() {
    var config = new ConnectionConfig({ flags: '+CONNECT_ATTRS' });
    equal(config.clientFlags & ClientConstants.CLIENT_CONNECT_ATTRS, 0);
  }
});

test('ConnectionConfig#Constructor.charset', {
  'accepts charset name': function() {
    var config = new ConnectionConfig({
      charset: 'LATIN1_SWEDISH_CI'
    });

    equal(config.charsetNumber, Charsets.LATIN1_SWEDISH_CI);
  },

  'accepts case-insensitive charset name': function() {
    var config = new ConnectionConfig({
      charset: 'big5_chinese_ci'
    });

    equal(config.charsetNumber, Charsets.BIG5_CHINESE_CI);
  },

  'accepts short charset name': function() {
    var config = new ConnectionConfig({
      charset: 'UTF8MB4'
    });

    equal(config.charsetNumber, Charsets.UTF8MB4_GENERAL_CI);
  },

  'throws on unknown charset': function() {
    var config;
    var error;

    try {
      config = new ConnectionConfig({
        charset: 'INVALID_CHARSET'
      });
    } catch (err) {
      error = err;
    }

    ok(config === undefined);
    ok(error);
    equal(error.name, 'TypeError');
    equal(error.message, 'Unknown charset \'INVALID_CHARSET\'');
  },

  'all charsets should have short name': function() {
    var charsets = Object.keys(Charsets);

    for (var i = 0; i < charsets.length; i++) {
      var charset = charsets[i];
      ok(Charsets[charset]);
      ok(Charsets[charset.split('_')[0]]);
    }
  }
});

test('ConnectionConfig#Constructor.connectTimeout', {
  'defaults to 10 seconds': function() {
    var config = new ConnectionConfig({});

    equal(config.connectTimeout, (10 * 1000));
  },

  'undefined uses default': function() {
    var config = new ConnectionConfig({
      connectTimeout: undefined
    });

    equal(config.connectTimeout, (10 * 1000));
  },

  'can set to null': function() {
    var config = new ConnectionConfig({
      connectTimeout: null
    });

    equal(config.connectTimeout, null);
  },

  'can set to 0': function() {
    var config = new ConnectionConfig({
      connectTimeout: 0
    });

    equal(config.connectTimeout, 0);
  },

  'can set to custom value': function() {
    var config = new ConnectionConfig({
      connectTimeout: 10000
    });

    equal(config.connectTimeout, 10000);
  }
});

test('ConnectionConfig#Constructor.ssl', {
  'defaults to false': function() {
    var config = new ConnectionConfig({});

    equal(config.ssl, false);
  },

  'string "Amazon RDS" loads valid profile': function() {
    var config = new ConnectionConfig({
      ssl: 'Amazon RDS'
    });

    ok(config.ssl);
    ok(Array.isArray(config.ssl.ca));

    config.ssl.ca.forEach(function (ca) {
      equal(typeof ca, 'string', 'ca is a string');

      if (createPublicKey) {
        var key = null;

        doesNotThrow(function () { key = createPublicKey(ca); });
        equal(key.type, 'public');
      }
    });
  },

  'throws on unknown profile name': function() {
    var config;
    var error;

    try {
      config = new ConnectionConfig({
        ssl: 'invalid profile'
      });
    } catch (err) {
      error = err;
    }

    ok(config === undefined);
    ok(error);
    equal(error.name, 'TypeError');
    equal(error.message, 'Unknown SSL profile \'invalid profile\'');
  }
});

test('ConnectionConfig#Constructor.timezone', {
  'defaults to "local"': function() {
    var config = new ConnectionConfig({});

    equal(config.timezone, 'local');
  },

  'accepts url timezone with encoded +': function() {
    var config = new ConnectionConfig('mysql://myhost/mydb?timezone=%2b0200');
    equal(config.timezone, '+0200');
  },

  'accepts url timezone with literal +': function() {
    var config = new ConnectionConfig('mysql://myhost/mydb?timezone=+0200');
    equal(config.timezone, '+0200');
  }
});

test('ConnectionConfig#mergeFlags', {
  'adds flag to empty list': function() {
    var initial  = '';
    var flags    = 'LONG_PASSWORD';
    var combined = ConnectionConfig.mergeFlags(initial, flags);

    strictEqual(combined, ClientConstants.CLIENT_LONG_PASSWORD);
  },

  'adds flag to list': function() {
    var initial  = ['LONG_PASSWORD', 'FOUND_ROWS'];
    var flags    = 'LONG_FLAG';
    var combined = ConnectionConfig.mergeFlags(initial, flags);

    strictEqual(combined, ClientConstants.CLIENT_LONG_PASSWORD
      | ClientConstants.CLIENT_FOUND_ROWS
      | ClientConstants.CLIENT_LONG_FLAG);
  },

  'adds unknown flag to list': function() {
    var initial  = ['LONG_PASSWORD', 'FOUND_ROWS'];
    var flags    = 'UNDEFINED_CONSTANT';
    var combined = ConnectionConfig.mergeFlags(initial, flags);

    strictEqual(combined, ClientConstants.CLIENT_LONG_PASSWORD
      | ClientConstants.CLIENT_FOUND_ROWS);
  },

  'removes flag from empty list': function() {
    var initial  = '';
    var flags    = '-LONG_PASSWORD';
    var combined = ConnectionConfig.mergeFlags(initial, flags);

    strictEqual(combined, 0x0);
  },

  'removes existing flag from list': function() {
    var initial  = ['LONG_PASSWORD', 'FOUND_ROWS'];
    var flags    = '-LONG_PASSWORD';
    var combined = ConnectionConfig.mergeFlags(initial, flags);

    strictEqual(combined, ClientConstants.CLIENT_FOUND_ROWS);
  },

  'removes non-existing flag from list': function() {
    var initial  = ['LONG_PASSWORD', 'FOUND_ROWS'];
    var flags    = '-LONG_FLAG';
    var combined = ConnectionConfig.mergeFlags(initial, flags);

    strictEqual(combined, ClientConstants.CLIENT_LONG_PASSWORD
      | ClientConstants.CLIENT_FOUND_ROWS);
  },

  'removes unknown flag to list': function() {
    var initial  = ['LONG_PASSWORD', 'FOUND_ROWS'];
    var flags    = '-UNDEFINED_CONSTANT';
    var combined = ConnectionConfig.mergeFlags(initial, flags);

    strictEqual(combined, ClientConstants.CLIENT_LONG_PASSWORD
      | ClientConstants.CLIENT_FOUND_ROWS);
  }
});
