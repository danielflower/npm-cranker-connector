const http = require("http");
const https = require("https");
const connectToRouters = require("./crankconnect.js");
const querystring = require("querystring");
const assert = require("assert");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

connectToRouters(["localhost:16489"], "demo", "http://localhost:8300")
  .then(async routers => {
    console.log("after connect to routers");

    // Setup the demo server
    let demoServer = http.createServer((request, response) => {
        console.log("demoserver request headers", request.headers);
        let toReturnStatus = request.headers["x-expected-return-status"];
        response.statusCode = toReturnStatus == undefined ? 200 : toReturnStatus;
        response.setHeader("server", "demoserver");
        response.setHeader("x-demo-response", "xxx");
        response.write("<html><head><title>this");
        response.write("is a server</title><link rel='shortcut icon' href='data:image/x-icon;,' type='image/x-icon'></head><body>");
        response.end("<h1>hello</h1></body></html>");
    });
    demoServer.listen(8300);

    let testUrl = async function (options, requestHandler) {
        return new Promise((resolve, reject) => {
            let req = https.request(options, function (response) {
                console.log(
                    options.method + "Request response headers",
                    response.statusCode,
                    response.statusMessage,
                    response.headers);
                let resultObject = {
                    statusCode: response.statusCode,
                    statusMessage: response.statusMessage,
                    chunkArray: []
                };
                response.on("data", (d) => {
                    let string = new String(d);
                    resultObject.chunkArray.push(string);
                });
                response.on("end", function () {
                    resolve(resultObject);
                });
            });
            if (typeof requestHandler == "function") {
                requestHandler(req);
            }
            req.end();
        });
    };

    let testGet = async function () {
        let {statusCode, statusMessage, chunkArray} = await testUrl({ 
            host: 'localhost', 
            port: 8443,
            path: '/demo',
            method: 'GET',
            rejectUnauthorized: false,
            requestCert: true,
            agent: false
        });
        console.log("GET Result", statusCode, statusMessage, chunkArray);
        assert.deepStrictEqual(statusCode, 200);
        assert.deepStrictEqual(statusMessage, "OK");
    };

    let testPost = async function () {
        const postData = querystring.stringify({
            'msg': 'Hello World!'
        });
        let {statusCode, statusMessage, chunkArray} = await testUrl({ 
            host: 'localhost', 
            port: 8443,
            path: '/demo',
            method: 'POST',
            rejectUnauthorized: false,
            requestCert: true,
            agent: false,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, request => { request.write(postData); });
        console.log("POST result", statusCode, statusMessage, chunkArray);
        assert.deepStrictEqual(statusCode, 200);
        assert.deepStrictEqual(statusMessage, "OK");
        assert.deepStrictEqual(chunkArray, [
            new String("<html><head><title>this"),
            new String("is a server</title><link rel='shortcut icon' href='data:image/x-icon;,' type='image/x-icon'></head><body>"),
            new String("<h1>hello</h1></body></html>"),
        ]);
    };


    let testPost201 = async function () {
        const postData = querystring.stringify({
            'msg': 'Hello World!'
        });
        let {statusCode, statusMessage, chunkArray} = await testUrl({ 
            host: 'localhost', 
            port: 8443,
            path: '/demo',
            method: 'POST',
            rejectUnauthorized: false,
            requestCert: true,
            agent: false,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                "x-expected-return-status": "201"
            }
        }, request => { request.write(postData); });
        console.log("POST result", statusCode, statusMessage, chunkArray);
        assert.deepStrictEqual(statusCode, 201);
        assert.deepStrictEqual(statusMessage, "Created");
    };

    let testPost400 = async function () {
        const postData = querystring.stringify({
            'msg': 'Hello World!'
        });
        let {statusCode, statusMessage, chunkArray} = await testUrl({ 
            host: 'localhost', 
            port: 8443,
            path: '/demo',
            method: 'POST',
            rejectUnauthorized: false,
            requestCert: true,
            agent: false,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                "x-expected-return-status": "400"
            }
        }, request => { request.write(postData); });
        console.log("POST result", statusCode, statusMessage, chunkArray);
        assert.deepStrictEqual(statusCode, 400);
        assert.deepStrictEqual(statusMessage, "Bad Request");
    };


    let testAll = async function () {
        await testGet();
        await testPost();
        await testPost201();
        await testPost400();
    };

    await testAll();

    routers.close();
    demoServer.close();
    console.log("after close");

    return 0;
});