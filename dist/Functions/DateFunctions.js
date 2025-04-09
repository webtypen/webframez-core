"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateFunctions = void 0;
const moment_1 = __importDefault(require("moment"));
class DateFunctionsFacade {
    formatDateRange(start, end) {
        const startDate = (0, moment_1.default)(start, "YYYY-MM-DD", true);
        const endDate = (0, moment_1.default)(end, "YYYY-MM-DD", true);
        if (!startDate.isValid() || !endDate.isValid()) {
            throw new Error("Ungültiges Datumsformat");
        }
        const startYear = startDate.year();
        const endYear = endDate.year();
        // Ganzes Jahr
        if (startDate.month() === 0 && startDate.date() === 1 && endDate.month() === 11 && endDate.date() === 31 && startYear === endYear) {
            return `${startYear}`;
        }
        // Semester
        if (startYear === endYear) {
            // 1. Halbjahr: 01.01 - 30.06
            if (startDate.month() === 0 && startDate.date() === 1 && endDate.month() === 5 && endDate.date() === 30) {
                return `1. Halbjahr ${startYear}`;
            }
            // 2. Halbjahr: 01.07 - 31.12
            if (startDate.month() === 6 && startDate.date() === 1 && endDate.month() === 11 && endDate.date() === 31) {
                return `2. Halbjahr ${startYear}`;
            }
        }
        // Quartal
        if (startYear === endYear) {
            // Q1: 01.01 - 31.03
            if (startDate.month() === 0 && startDate.date() === 1 && endDate.month() === 2 && endDate.date() === 31) {
                return `Q1 ${startYear}`;
            }
            // Q2: 01.04 - 30.06
            if (startDate.month() === 3 && startDate.date() === 1 && endDate.month() === 5 && endDate.date() === 30) {
                return `Q2 ${startYear}`;
            }
            // Q3: 01.07 - 30.09
            if (startDate.month() === 6 && startDate.date() === 1 && endDate.month() === 8 && endDate.date() === 30) {
                return `Q3 ${startYear}`;
            }
            // Q4: 01.10 - 31.12
            if (startDate.month() === 9 && startDate.date() === 1 && endDate.month() === 11 && endDate.date() === 31) {
                return `Q4 ${startYear}`;
            }
        }
        // Monat
        if (startYear === endYear && startDate.month() === endDate.month()) {
            if (startDate.date() === 1) {
                const lastDay = startDate.clone().endOf("month").date();
                if (endDate.date() === lastDay) {
                    const months = [
                        "Januar",
                        "Februar",
                        "März",
                        "April",
                        "Mai",
                        "Juni",
                        "Juli",
                        "August",
                        "September",
                        "Oktober",
                        "November",
                        "Dezember",
                    ];
                    return `${months[startDate.month()]} ${startYear}`;
                }
            }
        }
        // Kalenderwoche (KW)
        const diffDays = endDate.diff(startDate, "days");
        if (diffDays === 6 &&
            startDate.day() === 1 && // Montag
            endDate.day() === 0 // Sonntag
        ) {
            const weekNumber = startDate.isoWeek();
            return `KW-${weekNumber} ${startYear}`;
        }
        // Standard
        return `${startDate.format("DD.MM.YYYY")} - ${endDate.format("DD.MM.YYYY")}`;
    }
}
exports.DateFunctions = new DateFunctionsFacade();
