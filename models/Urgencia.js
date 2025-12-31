// models/Urgencia.js
const mongoose = require('mongoose');

const UrgenciaSchema = new mongoose.Schema({
    UrgencyRegister: {
        Header: {
            InstitutionId: Number,
            HospitalName: String,
            Timestamp: Date
        },
        Data: {
            Typology: String,
            OpenState: String,
            Address: String,
            WaitingPatients: {
                NonUrgent: Number,
                LessUrgent: Number,
                Urgent: Number,
                VeryUrgent: Number
            },
            ObservingPatients: {
                NonUrgent: Number,
                LessUrgent: Number,
                Urgent: Number,
                VeryUrgent: Number
            }
        }
    }
}, { timestamps: true });

// O segredo está aqui: exportar o modelo para ser usado noutros ficheiros
module.exports = mongoose.model('Urgencia', UrgenciaSchema);