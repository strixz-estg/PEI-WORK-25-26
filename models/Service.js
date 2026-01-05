const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
    ServiceKey: { type: Number, required: true, unique: true },
    Speciality: { type: String, required: true },
    
    // Códigos (Vêm do XML)
    TypeCode: { type: Number, required: true }, 
    PriorityCode: { type: Number, required: true },

    // Descrições (Geradas Automaticamente pela API)
    TypeDescription: String,
    PriorityDescription: String
});

module.exports = mongoose.model('Service', ServiceSchema);