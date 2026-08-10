'use strict';

const { readFileSync } = require('node:fs');
const { imageMeta } = require('image-meta');

const ICNS_SIGNATURE = Uint8Array.from([0x69, 0x63, 0x6e, 0x73]);

function isIcns(input) {
  return ICNS_SIGNATURE.every((byte, index) => input[index] === byte);
}

function readInput(input) {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (typeof input === 'string') {
    return readFileSync(input);
  }

  throw new TypeError(
    'invalid invocation. input should be a Uint8Array or file path',
  );
}

function imageSize(input, callback) {
  try {
    const data = readInput(input);

    // Metro does not accept ICNS assets. Reject its signature before handing
    // data to a parser so a disguised, zero-length ICNS entry cannot loop.
    if (isIcns(data)) {
      throw new TypeError('unsupported file type: icns');
    }

    const result = imageMeta(data);

    if (typeof callback === 'function') {
      process.nextTick(callback, null, result);
      return undefined;
    }

    return result;
  } catch (error) {
    if (typeof callback === 'function') {
      process.nextTick(callback, error);
      return undefined;
    }

    throw error;
  }
}

module.exports = imageSize;
module.exports.default = imageSize;
module.exports.imageSize = imageSize;
