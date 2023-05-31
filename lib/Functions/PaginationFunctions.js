"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationList = void 0;
const DBConnection_1 = require("../Database/DBConnection");
const paginationList = (options, aggregation, aggregationOptional) => __awaiter(void 0, void 0, void 0, function* () {
    const page = options.page && parseInt(options.page) > 0 ? parseInt(options.page) : 0;
    const perPage = options.perPage && parseInt(options.perPage) > 0 ? parseInt(options.perPage) : 50;
    const connection = yield DBConnection_1.DBConnection.getConnection();
    const collection = connection.client.db(null).collection(options.collection);
    const promises = [];
    let total = 0;
    promises.push(new Promise((resolve) => __awaiter(void 0, void 0, void 0, function* () {
        const temp = yield collection
            .aggregate([
            ...(aggregation && aggregation.length > 0 ? aggregation : []),
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                },
            },
        ])
            .toArray();
        if (temp && temp[0] && temp[0].count && parseInt(temp[0].count) > 0) {
            total = temp[0].count;
        }
        resolve();
    })));
    let entries = null;
    promises.push(new Promise((resolve) => __awaiter(void 0, void 0, void 0, function* () {
        entries = yield collection
            .aggregate([
            ...(aggregation && aggregation.length > 0 ? aggregation : []),
            {
                $skip: page * perPage,
            },
            {
                $limit: perPage,
            },
            ...(aggregationOptional && aggregationOptional.length > 0 ? aggregationOptional : []),
        ])
            .toArray();
        resolve();
    })));
    yield Promise.all(promises);
    return {
        entries: entries,
        total: total,
        perPage: perPage,
        page: page,
    };
});
exports.paginationList = paginationList;
