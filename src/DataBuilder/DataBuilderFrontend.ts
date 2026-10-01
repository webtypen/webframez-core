import type { Request } from "../Router/Request";
import type { DataBuilderFields } from "./DataBuilderTypes";

export async function fieldsForFrontend(
    fields: DataBuilderFields,
    payload?: any,
    childrenForFrontend: (fields: DataBuilderFields, payload?: any) => Promise<DataBuilderFields> = fieldsForFrontend,
): Promise<DataBuilderFields> {
    const out: any = {};
    for (let key in fields) {
        out[key] = {
            ...fields[key],
            ...(fields[key].schema ? { schema: await childrenForFrontend(fields[key].schema!, payload) } : {}),
        };

        if (out[key].type === "option" && typeof fields[key].options === "function") {
            out[key].options = await fields[key].options(payload);
        }

        if (out[key].disabled && typeof out[key].disabled === "function") {
            out[key].disabled = await out[key].disabled(payload);
        }
    }
    return out;
}

export async function typeForFrontend(type: any, req: Request, structured = false) {
    const newData: any = {};
    if (structured) {
        const main = { ...type.forms.main };
        for (const key of ["pageActions", "backLink", "allowDeletion"]) {
            if (typeof main[key] === "function") main[key] = await main[key](req);
        }
        delete main.onSaveRedirect;
        delete main.onDeleteRedirect;
        return { ...type, forms: { main } };
    }
    for (let key in type) {
        if (key === "forms") {
            newData.forms = {};
            if (typeof type.forms === "function") {
                newData.forms = await type.forms(req);

                if (newData?.forms) {
                    for (let form in newData.forms) {
                        if (typeof newData.forms[form].pageActions === "function") {
                            newData.forms[form].pageActions = await newData.forms[form].pageActions(req);
                        }
                        if (typeof newData.forms[form].fields === "function") {
                            newData.forms[form].fields = await newData.forms[form].fields(req);
                        }
                        if (typeof newData.forms[form].backLink === "function") {
                            newData.forms[form].backLink = await newData.forms[form].backLink(req);
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
                    newData.forms[form].pageActions = await type.forms[form].pageActions(req);
                } else if (type.forms[form].pageActions) {
                    newData.forms[form].pageActions = JSON.parse(JSON.stringify(type.forms[form].pageActions));
                }

                if (typeof type.forms[form].backLink === "function") {
                    newData.forms[form].backLink = await type.forms[form].backLink(req);
                }

                if (typeof type.forms[form].fields === "function") {
                    newData.forms[form].fields = await type.forms[form].fields(req);
                } else if (type.forms[form].fields) {
                    newData.forms[form].fields = JSON.parse(JSON.stringify(type.forms[form].fields));
                }

                if (!newData.forms[form].fields || newData.forms[form].fields.length < 1) {
                    continue;
                }

                newData.forms[form].allowDeletion =
                    (typeof type.forms[form].allowDeletion === "boolean" && type.forms[form].allowDeletion) ||
                    (typeof type.forms[form].allowDeletion === "function" && (await type.forms[form].allowDeletion(req)))
                        ? true
                        : false;
            }
        } else {
            newData[key] = type[key];
        }
    }
    return newData;
}
