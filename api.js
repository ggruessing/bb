const REST = require('./rest.js')
const WS = require('./websocket.js')
const REST2 = require('./rest2.js')
const WS2 = require('./ws2.js')


class BFX {
  constructor (apiKey, apiSecret, opts = { version: 1, transform: false }) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret

    if (opts.autoOpen !== false) {
      opts.autoOpen = true
    }

    if (typeof opts === 'number') {
      const msg = [
        'constructor takes an object since version 1.0.0, see:',
        'https://github.com/bitfinexcom/bitfinex-api-node#version-100-breaking-changes',
        ''
      ].join('\n')
      throw new Error(msg)
    }

    let transformer = function passThrough (d) { return d }
    if (opts.transform === true) {
      transformer 
    }

    if (typeof opts.transform === 'function') {
      transformer = opts.transform
    }
