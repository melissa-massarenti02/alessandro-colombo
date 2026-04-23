const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    cliente: { type: String, required: true },
    metodo_pagamento: { type: String, required: true },
    ricevuta: String,
    prodotti: [{
        taglia: String,
        colore: String,
        quantita: Number
    }],
    pezzi_totali: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);