// -*- js-indent-level: 4 -*-

const WebSocket = require("ws");
const https = require("https");
const http = require("http");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";


let routerConnect = function (routerAuthority, route, targetLocation) {
    let targetRequest = undefined;
    let ws = new WebSocket("wss://" + routerAuthority + "/register", {
        headers: {
            CrankerProtocol: "1.0",
            Route: route
        }
    });

    ws.on('open', function () {
        console.log("router connected", routerAuthority, route, targetLocation);
    });

    ws.on('message', function (data) {
        // console.log("data", data);
        if (targetRequest !== undefined) {
            // continuing an already established request
            targetRequest.write(data);
        }
        else {
            // We're using a socket so we reconnect
            console.log("headers received so emitting");
            ws.emit("cranker__headerPacketReceived");

            // Now parse the cranked request
            let [requestLine, ...headerRest] = data.split("\n");

            let [method, uri, version] = requestLine.split(" ");
            
            let [bodyMarker, blankLine, ...headerArray] = headerRest.reverse();
            
            let headers = {};
            headerArray.forEach(header => {
                let [name, value] = header.split(":", 2);
                headers[name] = value;
            });

            targetRequest = http.request({ 
                host: 'localhost', 
                port: 8300,
                path: uri,
                method: method,
                headers: headers
            }, function (targetResponse) {
                let statusCode = targetResponse.statusCode;
                let statusMessage = targetResponse.statusMessage;
                let headerList = Object.keys(targetResponse.headers)
                    .map(headerName => [headerName, targetResponse.headers[headerName]]);
                console.log("targetResponse>", statusCode, statusMessage, headerList);
                let headerLines = headerList.map(headerPair => headerPair.join(":"));
                let headerBlock = headerLines.join("\n");
                
                ws.send(`HTTP/1.1 ${statusCode} ${statusMessage}\n${headerBlock}\n\n`);
                
                targetResponse.on("data", (d) => {
                    ws.send(d);
                });

                targetResponse.on("end", () => {
                    ws.close();
                });

            });

            if (["_2", "_3"].includes(bodyMarker)) {
                targetRequest.end();
            }
        }
    });
    
    return ws;
};

// Returns a promise resolving to an Array of router connection Arrays
const connectToRouters = function (routerAuthorityArray, route, targetLocation, options = {}) {
    return new Promise((resolve, reject) => {
        let {limit} = Object.assign({ limit: 2 }, options);
        let routers = routerAuthorityArray.map(routerAuthority => {
            let connections = {};
            let routerState = {};
            let connectEstablish = function () {
                console.log("connectEstablish - here we go", Object.keys(connections).length, limit);

                while (Object.keys(connections).length < limit) { //limit
                    console.log("connectEstablish in loop", Object.keys(connections).length, limit);
                    let ws = routerConnect(routerAuthority, route, targetLocation);
                    ws.nicId = new Date().valueOf();
                    connections[ws.nicId] = ws;
                    ws.on("cranker__headerPacketReceived", _ => {
                        console.log("header packet received");
                        delete connections[ws.nicId];
                        connectEstablish();
                    });
                    ws.on("connection", () => routerState.lastConnectTime = new Date());
                    ws.on("close", _ => {
                        console.log("router web socket end", routerAuthority, route, targetLocation);
                        delete connections[ws.nicId];
                    });
                    ws.on("error", (err) => {
                        console.log("router web socket error", err, routerAuthority, route, targetLocation);
                        delete connections[ws.nicId];
                    });
                }
                
                // loop through and ping
                Object.values(connections).forEach(ws => {
                    if (ws.readyState == 1) {
                        ws.ping(_ => {
                            console.log("ping status", ws.readyState);
                        });
                    }
                });
            };
            Object.assign(routerState, {
                connections: connections,
                interval: setInterval(connectEstablish, 5000)
            });
            connectEstablish();
            
            return routerState;
        });

        // We need to do this because of a bug in router we think... this is fixed elsewhere but not in the current github version
        setTimeout(_ => resolve(routers), 1000);
    });
};

connectToRouters(["localhost:16489"], "demo", "http://localhost:8300").then(_ => {
    console.log("after connect to routers");

    // Tests
    const querystring = require("querystring");
    const assert = require("assert");

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

    testAll().then();
});

// End
