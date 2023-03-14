import { DBConnection } from "@webtypen/webframez-core";

export const paginationList = async (options: any, aggregation?: any, aggregationOptional?: any) => {
    const page = options.page && parseInt(options.page) > 0 ? parseInt(options.page) : 0;
    const perPage = options.perPage && parseInt(options.perPage) > 0 ? parseInt(options.perPage) : 50;
    const connection = await DBConnection.getConnection();
    const collection = connection.client.db(null).collection(options.collection);

    const promises = [];
    let total = 0;
    promises.push(
        new Promise(async (resolve: Function) => {
            const temp = await collection
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
        })
    );

    let entries = null;
    promises.push(
        new Promise(async (resolve: Function) => {
            entries = await collection
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
        })
    );

    await Promise.all(promises);

    return {
        entries: entries,
        total: total,
        perPage: perPage,
        page: page,
    };
};
