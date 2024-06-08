export type Request = {
    [key: string]: any;
    body?: any;
    bodyPlain?: any;
    params: object;
    httpVersionMajor: any;
    httpVersionMinor: any;
    httpVersion: any;
    headers: object;
    rawHeaders: object;
    url: string;
    method: string;
};
