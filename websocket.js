'use strict'

const {EventEmitter} = require('events')
const debug = require('debug')('bitfinex:ws')
const crypto = require('crypto')
const WebSocket = require('ws')
const util = require('util')
const { isSnapshot } = require('./lib/helper.js')


const BitfinexWS = function (APIKey, APISecret) {
  EventEmitter.call(this)

  this.APIKey = APIKey
  this.APISecret = APISecret
}

util.inherits(BitfinexWS, EventEmitter)


BitfinexWS.prototype.WebSocketURI = 'wss://api.bitfinex.com/ws/'

BitfinexWS.prototype.open = function open () {
  this.ws = new WebSocket(this.WebSocketURI)
  this.ws.on('message', this.onMessage.bind(this))
  this.ws.on('open', this.onOpen.bind(this))
  this.ws.on('error', this.onError.bind(this))
  this.ws.on('close', this.onClose.bind(this))
}

BitfinexWS.prototype.onMessage = function (msg, flags) {
  try {
    msg = JSON.parse(msg)
  } catch (e) {
    console.error('[bfx ws2 error] received invalid json')
    console.error('[bfx ws2 error]', msg)
    console.trace()
    return
  }

  debug('Received message: %j', msg)
  debug('Emmited message event')
  this.emit('message', msg, flags)

  if (!Array.isArray(msg) && msg.event) {
    if (msg.event === 'subscribed') {
      debug('Subscription report received')
            
      const data = {
        channel: msg.channel,
        chanId: msg.chanId,
        pair: msg.pair
      }

      
      if (msg.prec) {
        data.prec = msg.prec
      }

      // Save to event map
      this.channelMap[msg.chanId] = data
      debug('Emitting \'subscribed\' %j', data)
            
      this.emit('subscribed', data)
    } else if (msg.event === 'auth' && msg.status !== 'OK') {
      this.emit('error', msg)
      debug('Emitting \'error\' %j', msg)
    } else if (msg.event === 'auth') {
      this.channelMap[msg.chanId] = {
        channel: 'auth'
      }
      debug('Emitting \'%s\' %j', msg.event, msg)
            
      this.emit(msg.event, msg)
    } else {
      debug('Emitting \'%s\' %j', msg.event, msg)
      this.emit(msg.event, msg)
    }
  } else {
    this.handleChannel(msg)
  }
}

BitfinexWS.prototype.handleChannel = function (msg) {
  debug('Received data from a channel')
  // First element of Array is the channelId, the rest is the info.
  const channelId = msg.shift() // Pop the first element
  const event = this.channelMap[channelId]
  if (event) {
    debug('Message in \'%s\' channel', event.channel)
    if (event.channel === 'book') {
      this._processBookEvent(msg, event)
    } else if (event.channel === 'trades') {
      this._processTradeEvent(msg, event)
    } else if (event.channel === 'ticker') {
      this._processTickerEvent(msg, event)
    } else if (event.channel === 'auth') {
      this._processUserEvent(msg)
    } else {
      debug('Message in unknown channel')
    }
  }
}

BitfinexWS.prototype._processUserEvent = function (msg) {
  if (msg[0] === 'hb') { // HeatBeart
    debug('Received HeatBeart in user channel')
  } else {
    const event = msg[0]
    const data = msg[1]
    if (Array.isArray(data[0])) {
      data[0].forEach((ele) => {
        debug('Emitting \'%s\' %j', event, ele)
        this.emit(event, ele)
      })
    } else if (data.length) {
      debug('Emitting \'%s\', %j', event, data)
      this.emit(event, data)
    }
  }
}

BitfinexWS.prototype._processTickerEvent = function (msg, event) {
  if (msg[0] === 'hb') { // HeatBeart
    debug('Received HeatBeart in %s ticker channel', event.pair)
    return
  }

  if (msg.length > 9) { // Update
    const update = {
      bid: msg[0],
      bidSize: msg[1],
      ask: msg[2],
      askSize: msg[3],
      dailyChange: msg[4],
      dailyChangePerc: msg[5],
      lastPrice: msg[6],
      volume: msg[7],
      high: msg[8],
      low: msg[9]
    }
    debug('Emitting ticker, %s, %j', event.pair, update)
        
    this.emit('ticker', event.pair, update)
  }
}

BitfinexWS.prototype._processTradeEvent = function (msg, event) {
  if (msg[0] === 'hb') {
    debug('Received HeatBeart in %s trade channel', event.pair)
  }

  if (isSnapshot(msg)) {
    const snapshot = msg[0].map((el) => {
      return {
        seq: el[0],
        timestamp: el[1],
        price: el[2],
        amount: el[3]
      }
    })

    debug('Emitting trade snapshot, %s, %j', event.pair, snapshot)
    this.emit('trade', event.pair, snapshot)
    return
  }

  if (msg[0] === 'te') { // Trade executed
    const update = {
      seq: msg[1],
      timestamp: msg[2],
      price: msg[3],
      amount: msg[4]
    }
    debug('Emitting trade, %s, %j', event.pair, update)
        
    this.emit('trade', event.pair, update)
  } else if (msg[0] === 'tu') { // Trade executed
    const update = {
      seq: msg[1],
      id: msg[2],
      timestamp: msg[3],
      price: msg[4],
      amount: msg[5]
    }
    debug('Emitting trade, %s, %j', event.pair, update)
        
    this.emit('trade', event.pair, update)
  }
}

BitfinexWS.prototype._processBookEvent = function (msg, event) {
  if (msg[0] === 'hb') { // HeatBeart
    debug('Received HeatBeart in %s book channel', event.pair)
    return
  }

  if (!isSnapshot(msg[0]) && msg.length > 2) {
    let update
    if (event.prec === 'R0') {
      update = {
        price: msg[1],
        orderId: msg[0],
        amount: msg[2]
      }

      debug('Emitting orderbook, %s, %j', event.pair, update)
      this.emit('orderbook', event.pair, update)
      return
    }

    update = {
      price: msg[0],
      count: msg[1],
      amount: msg[2]
    }

    debug('Emitting orderbook, %s, %j', event.pair, update)
    this.emit('orderbook', event.pair, update)
  }

  msg = msg[0]
  if (isSnapshot(msg)) {
    const snapshot = msg.map((el) => {
      if (event.prec === 'R0') {
        return {
          orderId: el[0],
          price: el[1],
          amount: el[2]
        }
      }
      return {
        price: el[0],
        count: el[1],
        amount: el[2]
      }
    })

    debug('Emitting orderbook snapshot, %s, %j', event.pair, snapshot)
    this.emit('orderbook', event.pair, snapshot)
  }
}

BitfinexWS.prototype.close = function () {
  this.ws.close()
}

BitfinexWS.prototype.onOpen = function () {
  this.channelMap = {} // Map channels IDs to events
  this.emit('open')
}

BitfinexWS.prototype.onError = function (error) {
  this.emit('error', error)
}

BitfinexWS.prototype.onClose = function () {
  this.emit('close')
}

BitfinexWS.prototype.send = function (msg) {
  debug('Sending %j', msg)
  this.ws.send(JSON.stringify(msg))
}


BitfinexWS.prototype.subscribeOrderBook =
    function (pair = 'BTCUSD', precision = 'P0', length = '25') {
      this.send({
        event: 'subscribe',
        channel: 'book',
        pair,
        prec: precision,
        len: length
      })
    }


BitfinexWS.prototype.subscribeTrades = function (pair = 'BTCUSD') {
  this.send({
    event: 'subscribe',
    channel: 'trades',
    pair
  })
}


BitfinexWS.prototype.subscribeTicker = function (pair = 'BTCUSD') {
  this.send({
    event: 'subscribe',
    channel: 'ticker',
    pair
  })
}


BitfinexWS.prototype.unsubscribe = function (chanId) {
  this.send({
    event: 'unsubscribe',
    chanId
  })
}


BitfinexWS.prototype.auth = function () {
  const payload = 'AUTH' + (new Date().getTime())
  const signature = crypto.createHmac('sha384', this.APISecret)
    .update(payload)
    .digest('hex')
  this.send({
    event: 'auth',
    apiKey: this.APIKey,
    authSig: signature,
    authPayload: payload
  })
}

module.exports = BitfinexWS
