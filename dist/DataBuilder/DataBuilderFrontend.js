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
exports.typeForFrontend = exports.fieldsForFrontend = void 0;
function fieldsForFrontend(fields, payload, childrenForFrontend = fieldsForFrontend) {
    return __awaiter(this, void 0, void 0, function* () {
        const out = {};
        for (let key in fields) {
            out[key] = Object.assign(Object.assign({}, fields[key]), (fields[key].schema ? { schema: yield childrenForFrontend(fields[key].schema, payload) } : {}));
            if (out[key].type === "option" && typeof fields[key].options === "function") {
                out[key].options = yield fields[key].options(payload);
            }
            if (out[key].disabled && typeof out[key].disabled === "function") {
                out[key].disabled = yield out[key].disabled(payload);
            }
        }
        return out;
    });
}
exports.fieldsForFrontend = fieldsForFrontend;
function typeForFrontend(type, req, structured = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const newData = {};
        if (structured) {
            const main = Object.assign({}, type.forms.main);
            for (const key of ["pageActions", "backLink", "allowDeletion"]) {
                if (typeof main[key] === "function")
                    main[key] = yield main[key](req);
            }
            delete main.onSaveRedirect;
            delete main.onDeleteRedirect;
            return Object.assign(Object.assign({}, type), { forms: { main } });
        }
        for (let key in type) {
            if (key === "forms") {
                newData.forms = {};
                if (typeof type.forms === "function") {
                    newData.forms = yield type.forms(req);
                    if (newData === null || newData === void 0 ? void 0 : newData.forms) {
                        for (let form in newData.forms) {
                            if (typeof newData.forms[form].pageActions === "function") {
                                newData.forms[form].pageActions = yield newData.forms[form].pageActions(req);
                            }
                            if (typeof newData.forms[form].fields === "function") {
                                newData.forms[form].fields = yield newData.forms[form].fields(req);
                            }
                            if (typeof newData.forms[form].backLink === "function") {
                                newData.forms[form].backLink = yield newData.forms[form].backLink(req);
                            }
                        }
                    }
                }
                for (let form in type.forms) {
                    if (!type.forms[form] || !type.forms[form].fields) {
                        continue;
                    }
                    newData.forms[form] = {};
                    if (typeof type.forms[form].pageActions === "function") {
                        newData.forms[form].pageActions = yield type.forms[form].pageActions(req);
                    }
                    else if (type.forms[form].pageActions) {
                        newData.forms[form].pageActions = JSON.parse(JSON.stringify(type.forms[form].pageActions));
                    }
                    if (typeof type.forms[form].backLink === "function") {
                        newData.forms[form].backLink = yield type.forms[form].backLink(req);
                    }
                    if (typeof type.forms[form].fields === "function") {
                        newData.forms[form].fields = yield type.forms[form].fields(req);
                    }
                    else if (type.forms[form].fields) {
                        newData.forms[form].fields = JSON.parse(JSON.stringify(type.forms[form].fields));
                    }
                    if (!newData.forms[form].fields || newData.forms[form].fields.length < 1) {
                        continue;
                    }
                    newData.forms[form].allowDeletion =
                        (typeof type.forms[form].allowDeletion === "boolean" && type.forms[form].allowDeletion) ||
                            (typeof type.forms[form].allowDeletion === "function" && (yield type.forms[form].allowDeletion(req)))
                            ? true
                            : false;
                }
            }
            else {
                newData[key] = type[key];
            }
        }
        return newData;
    });
}
exports.typeForFrontend = typeForFrontend;
