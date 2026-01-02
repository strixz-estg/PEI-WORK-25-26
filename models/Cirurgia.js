const mongoose = require('mongoose');

const CirurgiaSchema = new mongoose.Schema({
    // --- A CORREÇÃO É ESTA LINHA ---
    _id: { type: String }, // Avisa o Mongo que o ID é uma String personalizada
    // -------------------------------

    Header: {
        InstitutionId: { type: Number, required: true },
        HospitalName: String,
        SubmissionDate: Date,
        DateReference: {
            Month: String,
            Year: Number
        }
    },
    SurgicalData: {
        SurgeryEntry: [{
            // Boa prática: Desligar o _id automático para sub-documentos para poupar espaço
            _id: false, 
            
            ServiceKey: Number,
            SurgicalSpeciality: String,
            Priority: String,
            Stats: {
                WaitingListCounts: {
                    General: Number,
                    NonOncological: Number,
                    Oncological: Number
                },
                AverageWaitDays: {
                    General: Number,
                    Oncological: Number,
                    NonOncological: Number
                }
            }
        }]
    }
}, { timestamps: true });

module.exports = mongoose.model('Cirurgia', CirurgiaSchema);