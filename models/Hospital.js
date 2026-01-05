const mongoose = require('mongoose');

const HospitalSchema = new mongoose.Schema({
    InstitutionId: { type: Number, required: true, unique: true },
    HospitalName: { type: String, required: true },
    Description: String,
    Location: {
        Address: String,
        PostalCode: String,
        City: String,
        District: String,
        Coordinates: {
            Lat: Number,
            Long: Number
        }
    },
    Contacts: {
        Phone: String,
        Email: String,
        Website: String
    },
    Region: {
        Nuts1: String,
        Nuts2: String,
        Nuts3: String
    }
});

module.exports = mongoose.model('Hospital', HospitalSchema);