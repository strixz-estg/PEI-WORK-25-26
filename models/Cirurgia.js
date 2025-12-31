const mongoose = require('mongoose');

const CirurgiaSchema = new mongoose.Schema({
    SurgeryReport: {
        Header: {
            InstitutionId: Number,
            HospitalName: String,
            ReferencePeriod: String
        },
        SurgicalData: {
            SurgeryEntry: [{ // Array porque maxOccurs="unbounded"
                Specialty: String,
                WaitingListCounts: {
                    General: Number,
                    NonOncological: Number,
                    Oncological: Number
                },
                AverageWaitTimeDays: Number
            }]
        }
    }
}, { timestamps: true });

module.exports = mongoose.model('Cirurgia', CirurgiaSchema);