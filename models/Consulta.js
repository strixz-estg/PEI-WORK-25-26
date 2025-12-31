const mongoose = require('mongoose');

const ConsultaSchema = new mongoose.Schema({
    ConsultationsRegister: {
        Header: {
            InstitutionId: Number,
            HospitalName: String,
            ReferencePeriod: String
        },
        Data: {
            Consultation: [{ // Array porque maxOccurs="unbounded"
                Speciality: String,
                TargetPopulation: String,
                WaitingListCounts: {
                    General: Number,
                    NonOncological: Number,
                    Oncological: Number
                },
                AverageResponseTimes: {
                    Normal: Number,
                    Priority: Number,
                    VeryPriority: Number
                }
            }]
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('Consulta', ConsultaSchema);