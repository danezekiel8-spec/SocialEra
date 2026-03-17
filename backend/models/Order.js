const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    userId:{type:String, required:true},
    products:[
        {productId:String, quantity:Number}
    ],
    amount:{type:Number, required:true},
    createdAt:{type:Date, default:Date.now}
});

module.exports = mongoose.model('Order', OrderSchema);
