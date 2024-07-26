async function auth(name, data, options) {
  options = options || {};

  switch (name) {
    case 'mysql_native_password':
      return await token(options.password, data.slice(0, 20));
    default:
      return undefined;
  }
}
const _auth = auth;
export { _auth as auth };

async function sha1(msg) {
  const hashBuffer = await crypto.subtle.digest('SHA-1', Buffer.from(msg, "binary"));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBinary = hashArray.map(byte => String.fromCharCode(byte)).join('');

  return hashBinary;
}
const _sha1 = sha1;
export { _sha1 as sha1 };

function xor(a, b) {
  a = Buffer.from(a, 'binary');
  b = Buffer.from(b, 'binary');
  var result = Buffer.allocUnsafe(a.length);
  for (var i = 0; i < a.length; i++) {
    result[i] = (a[i] ^ b[i]);
  }
  return result;
}
const _xor = xor;
export { _xor as xor };

export async function token(password, scramble) {
  if (!password) {
    return Buffer.alloc(0);
  }

  const encoder = new TextEncoder("utf-8");

  // password must be in binary format, not utf8
  var stage1 = await sha1(Buffer.from(encoder.encode(password)));
  var stage2 = await sha1(stage1);
  var stage3 = await sha1(scramble.toString("binary") + stage2);
 
  return xor(stage3, stage1);
}

// This is a port of sql/password.c:hash_password which needs to be used for
// pre-4.1 passwords.
export function hashPassword(password) {
  var nr     = [0x5030, 0x5735];
  var add    = 7;
  var nr2    = [0x1234, 0x5671];
  var result = Buffer.alloc(8);

  if (typeof password === 'string'){
    password = Buffer.from(password);
  }

  for (var i = 0; i < password.length; i++) {
    var c = password[i];
    if (c === 32 || c === 9) {
      // skip space in password
      continue;
    }

    // nr^= (((nr & 63)+add)*c)+ (nr << 8);
    // nr = xor(nr, add(mul(add(and(nr, 63), add), c), shl(nr, 8)))
    nr = this.xor32(nr, this.add32(this.mul32(this.add32(this.and32(nr, [0, 63]), [0, add]), [0, c]), this.shl32(nr, 8)));

    // nr2+=(nr2 << 8) ^ nr;
    // nr2 = add(nr2, xor(shl(nr2, 8), nr))
    nr2 = this.add32(nr2, this.xor32(this.shl32(nr2, 8), nr));

    // add+=tmp;
    add += c;
  }

  this.int31Write(result, nr, 0);
  this.int31Write(result, nr2, 4);

  return result;
}

export function randomInit(seed1, seed2) {
  return {
    max_value     : 0x3FFFFFFF,
    max_value_dbl : 0x3FFFFFFF,
    seed1         : seed1 % 0x3FFFFFFF,
    seed2         : seed2 % 0x3FFFFFFF
  };
}

export function myRnd(r){
  r.seed1 = (r.seed1 * 3 + r.seed2) % r.max_value;
  r.seed2 = (r.seed1 + r.seed2 + 33) % r.max_value;

  return r.seed1 / r.max_value_dbl;
}

export function scramble323(message, password) {
  if (!password) {
    return Buffer.alloc(0);
  }

  var to          = Buffer.allocUnsafe(8);
  var hashPass    = this.hashPassword(password);
  var hashMessage = this.hashPassword(message.slice(0, 8));
  var seed1       = this.int32Read(hashPass, 0) ^ this.int32Read(hashMessage, 0);
  var seed2       = this.int32Read(hashPass, 4) ^ this.int32Read(hashMessage, 4);
  var r           = this.randomInit(seed1, seed2);

  for (var i = 0; i < 8; i++){
    to[i] = Math.floor(this.myRnd(r) * 31) + 64;
  }
  var extra = (Math.floor(this.myRnd(r) * 31));

  for (var i = 0; i < 8; i++){
    to[i] ^= extra;
  }

  return to;
}

export function xor32(a, b){
  return [a[0] ^ b[0], a[1] ^ b[1]];
}

export function add32(a, b){
  var w1 = a[1] + b[1];
  var w2 = a[0] + b[0] + ((w1 & 0xFFFF0000) >> 16);

  return [w2 & 0xFFFF, w1 & 0xFFFF];
}

export function mul32(a, b){
  // based on this example of multiplying 32b ints using 16b
  // http://www.dsprelated.com/showmessage/89790/1.php
  var w1 = a[1] * b[1];
  var w2 = (((a[1] * b[1]) >> 16) & 0xFFFF) + ((a[0] * b[1]) & 0xFFFF) + (a[1] * b[0] & 0xFFFF);

  return [w2 & 0xFFFF, w1 & 0xFFFF];
}

export function and32(a, b){
  return [a[0] & b[0], a[1] & b[1]];
}

export function shl32(a, b){
  // assume b is 16 or less
  var w1 = a[1] << b;
  var w2 = (a[0] << b) | ((w1 & 0xFFFF0000) >> 16);

  return [w2 & 0xFFFF, w1 & 0xFFFF];
}

export function int31Write(buffer, number, offset) {
  buffer[offset] = (number[0] >> 8) & 0x7F;
  buffer[offset + 1] = (number[0]) & 0xFF;
  buffer[offset + 2] = (number[1] >> 8) & 0xFF;
  buffer[offset + 3] = (number[1]) & 0xFF;
}

export function int32Read(buffer, offset){
  return (buffer[offset] << 24)
       + (buffer[offset + 1] << 16)
       + (buffer[offset + 2] << 8)
       + (buffer[offset + 3]);
}
