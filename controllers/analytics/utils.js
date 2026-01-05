exports.getDates = (start, end) => {
    let startDate, endDate;
    if (start && end) {
        startDate = new Date(start);
        endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);
    } else {
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 365);
    }
    return { startDate, endDate };
};