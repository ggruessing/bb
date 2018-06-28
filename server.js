const BFX = require('./api.js')

const API_KEY = 'iShouldProbablyTakeTheseOut'
const API_SECRET = 'soNobodyStealsMyMagicInternetMoney'

//'down' bots variables and statuses. This bot shorts on margin to profit off downward trends in price
//the price at which the current order completed at
var purPriceD = 0000
//the price to include in next order, based on current market price, of the price to close at based on a 1% profit from current values
var botPriceD = 4697
//current open position boolean
var botStateD = false
//total successful shorts
var tradesD = 0
//unique id of current open margin position
var tidD = 0
//trend boolean
var down = true

//'down' bots variables and statuses. This places market buy orders with conditional stop sell orders to profit off upward trends in price

//the price at which the current order completed at
var purPriceU = 0000
//the price to include in next order, based on current market price, of the price to sell at based on a 1% profit from current values
var botPriceU = 4697
//current open order boolean
var botStateU = false
//total successful trades
var tradesU = 0
//unique id of current open trade
var tidU = 0
//trend boolean
var up = true

//tracker to let me know how many trend swings/handoffs of the up bot to the down bot have occured in this current cycle
var rounds = 0

const opts = {
  version: 2,
  transform: true
}

const bws = new BFX(API_KEY, API_SECRET, opts).ws

const bAPI = new Bitfinex(API_KEY, API_SECRET)
//authenticate with the stock exchange for access to my account
bws.on('auth', () => {
  console.log('authenticated')
  bws.subscribeTicker('BTCUSD')
  
  
})
//on websocket open, fire authenticaton 
bws.on('open', () => {
  bws.auth()
})
//websocket to listen to the market ticker, to keep purchase prices (and conditional prices to close/sell at) current and valid
bws.on('ticker', (pair, ticker) => {

  botPriceD = (ticker.BID * .999)
  botPriceU = (ticker.BID * 1.001)
  //pretty console logging so I can verify continuing functionality, check in as infrequently as possible and halt the program.. never
  console.log("")
  console.log("")
  console.log("Market: ",ticker.BID)
  console.log("-Bot- ",purPriceD)
  console.log("ID: ",tidD)
  console.log("tradesD: ",tradesD)
  console.log("")
  console.log("Market: ",ticker.BID)
  console.log("+Bot- ",purPriceU)
  console.log("ID: ",tidU)
  console.log("tradesU: ",tradesU)
  console.log("")
  console.log("Rounds: ",rounds)
  console.log("")
  //if both bots are ever cancelled, or the app has just started, launch both 'up' and 'down' bots in opposition to watch both and establish the current trend
  if ((tradesD===0)&&(tradesU===0)){
    if(down){
      botBuyD(botPriceD.toString())
      rounds++
    }
    if(up){
      botBuyU(botPriceU.toString())
      rounds++
    }
    //launch swinger
  }
 //conditional to catch too much of a slip in price and order a cancellation. If the bot has lost half of its profits in the current streak, close the latest order, turn off the 'down' bot and fire off the 'up' bot to catch the reveral in trend
  if (ticker.BID >= (purPriceD*(1+(001*(tradesD/2))))){
    //sell current bid before half loss
    sellD(tidD)
    //set tradesD to 0
    tradesD = 0
    //set state to false
    down = false
    up = true

  }
  //conditional to catch too much of a slip in price and order a cancellation. If the bot has lost half of its profits in the current streak, close the latest order, turn off the 'up' bot and fire off the 'down' bot to catch the reveral in trend
  if (ticker.BID <= (purPriceU*(1+(001*(tradesU/2))))){
    //sell current bid before half loss
    sellU(tidU)
    //set tradesD to 0
    tradesU = 0
    //set state to false
    down = true
    up = false
  }
})

bws.on('ws' , (wallet) => {
  console.log(wallet)

 })

bws.on('os', (orders,orders2,orders3) => {
  console.log("os")
  console.log(orders)
  console.log(orders2)
  console.log(orders3)
 })
// logs all order placement confirmations to capture the generated order ID, price completed at and set the state to true (open order) to prevent double orders, increment streak counter
bws.on('on' , (orders) => {
  console.log("on")
  console.log(orders)
  var check = orders[6]
  if((check < 0)&&(!botStateD)){
    tidD = orders[0]
    purPriceD=orders[16]
    botStateD = true
    tradesD++
  }
  if((check > 0)&&(!botStateU)){
    tidU = orders[0]
    purPriceU=orders[16]
    botStateU = true
    tradesU++
  }
})

bws.on('ou', (orders,) => {
  console.log("ou")
  console.log(orders)


})

bws.on('te' , (orders) => {
  console.log("te")
  console.log(orders)
})
//logs all orders to listen for the completion of a previously placed buy/sell cycle or margin/close cycle by ID to kick off another of the same
bws.on('tu' , (orders) => {
  console.log("tu")
  console.log(orders)
  if(tidD===orders[3]){
  botStateD = false
  botBuyD(botPriceD.toString()) 
  }
  if(tidU===orders[3]){
  botStateU = false
  botBuyU(botPriceU.toString()) 
  }
})

bws.on('error', console.error)

//call to short on margin with an attached close position to settle when a 1% profit has been made on a decrease in value
var botBuyD = function(price){
  if(!botStateD){
    bws.submitOrder([0,'on', null,{
      "type": "STOP",
      "symbol": "fBTC",
      "amount": "0.005",
      "price": price,
      "hidden": 0
      }
    ])
  }  
}

//call to purchase with an attached sell order when a 1% profit has been made
var botBuyU = function(price){
  if(!botStateU){
    bws.submitOrder([0,'on', null,{
      "type": "EXCHANGE STOP",
      "symbol": "tBTCUSD",
      "amount": "0.005",
      "price": price,
      "hidden": 0
      }
    ])
  }  
}
//function to cancel standing margin shorts if the bot decides too much of a loss has occured and resets the ID and Price
var sellD = function(id){
  bws.cancelOrder(id)
  tidD = 0
  purPriceD = 0
}
//function to cancel standing market order if the bot decides too much of a loss has occured and resets the ID and Price
var sellU = function(id){
  bws.cancelOrder(id)
  tidU = 0
  purPriceU = 0
}