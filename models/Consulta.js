const mongoose = require('mongoose');

const ConsultaSchema = new mongoose.Schema({
    // ID Personalizado (Ex: "203_2024_Dezembro")
    _id: { type: String, required: true },

    Header: {
        InstitutionId: { type: String, required: true },
        HospitalName: String,
        SubmissionDate: Date,
        DateReference: {
            Month: String,
            Year: Number
        }
    },
    Data: {
        ConsultationEntry: [{
            _id: false, // <--- IMPORTANTE: Impede a criação de IDs (_id) dentro do array
            ServiceKey: Number,
            Speciality: String,
            Stats: {
                WaitingListCounts: {
                    General: Number,
                    NonOncological: Number,
                    Oncological: Number
                },
                AverageWaitDays: {
                    General: Number,
                    NonOncological: Number,
                    Oncological: Number
                },
                AverageResponseTime: {
                    Normal: Number,
                    Prioritario: Number,
                    MuitoPrioritario: Number
                }
            }
        }]
    }
}, { timestamps: true });

module.exports = mongoose.model('Consulta', ConsultaSchema);