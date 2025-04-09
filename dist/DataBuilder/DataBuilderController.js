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
exports.DataBuilderController = void 0;
const Controller_1 = require("../Controller/Controller");
const DBConnection_1 = require("../Database/DBConnection");
const DataBuilder_1 = require("./DataBuilder");
class DataBuilderController extends Controller_1.Controller {
    constructor(builder) {
        super();
        this.builder = builder ? builder : new DataBuilder_1.DataBuilder();
    }
    restApi(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = yield DBConnection_1.DBConnection.getConnection();
            if (req.body.__builder_rest_api === "api-autocomplete") {
                return res.send(yield this.builder.apiAutoComplete(req));
            }
            else if (req.body.__builder_rest_api === "details") {
                return res.send(yield this.builder.details(db.client.db(null), req));
            }
            else if (req.body.__builder_rest_api === "details-newdata") {
                return res.send(yield this.builder.detailsNewData(db.client.db(null), req));
            }
            else if (req.body.__builder_rest_api === "save") {
                return res.send(yield this.builder.save(db.client.db(null), req));
            }
            else if (req.body.__builder_rest_api === "delete") {
                return res.send(yield this.builder.delete(db.client.db(null), req));
            }
            else if (req.body.__builder_rest_api === "type") {
                return res.send(yield this.builder.loadType(req));
            }
            return res.status(404).send({
                status: "error",
                message: "Api-Endpoint not found ...",
            });
        });
    }
}
exports.DataBuilderController = DataBuilderController;
