// -*- js-indent-level: 4 -*-

const WebSocket = require("ws");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const EventEmitter = require('events');


let routerConnect = function (routerAuthority, route, targetLocation, routerClusterObject) {
    let targetRequest = undefined;
    let [scheme, targetHost, port] = targetLocation.split(":");
    let ws = new WebSocket("wss://" + routerAuthority + "/register", {
        headers: {
            CrankerProtocol: "1.0",
            Route: route
        }
    });

    ws.on('open', function () {
        routerClusterObject.emit("crankerConnected", {
            ws: ws,
            authority: routerAuthority,
            route: route,
            targetLocation, targetLocation
        });
    });

    ws.on('message', function (data) {
        routerClusterObject.emit("crankerFrameReceived", {
            data: data,
            ws: ws
        });

        if (targetRequest !== undefined) {
            // continuing an already established request
            targetRequest.write(data);
        }
        else {
            // We're using a socket so we reconnect
            routerClusterObject.emit("crankerHeadersReceived", {
                connection: ws
            });
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

            // FIXME - use `scheme` to make protocol decision
            targetRequest = http.request({ 
                host: targetHost.substring(2), 
                port: port,
                path: uri,
                method: method,
                headers: headers
            }, function (targetResponse) {
                let statusCode = targetResponse.statusCode;
                let statusMessage = targetResponse.statusMessage;
                let headerList = Object.keys(targetResponse.headers)
                    .map(headerName => [headerName, targetResponse.headers[headerName]]);

                routerClusterObject.emit("crankedTargetResponse", {
                    ws: ws,
                    crankedRequest: {
                        uri: uri,
                        method: method,
                        headers: headers
                    },
                    statusCode: statusCode,
                    statusMessage: statusMessage,
                    headers: headerList
                });
                console.log("targetResponse>", );
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
        let closingState = false;
        let {limit} = Object.assign({ limit: 2 }, options);
        let routers = [];

        class RouterCluster extends EventEmitter {
            constructor() { super(); }
            close() {
                closingState = true;
                routers.forEach(router => {
                    clearInterval(router.interval);
                    Object.values(router.connections)
                        .filter(ws => ws.readyState == 1)
                        .forEach(ws => ws.close());
                });
            }
            routerObjects() {
                return routerObjects;
            }
        }

        let routerClusterObject = new RouterCluster();
        
        let routerList = routerAuthorityArray.map(routerAuthority => {
            let connections = {};
            let routerState = {};
            let connectEstablish = function () {
                routerClusterObject.emit("routerConnecting", {
                    currentConnectionLength: Object.keys(connections).length,
                    idleLimit: limit
                });

                while (closingState == false
                       && Object.keys(connections).length < limit) {
                    console.log("connectEstablish in loop", Object.keys(connections).length, limit);
                    let ws = routerConnect(routerAuthority, route, targetLocation, routerClusterObject);
                    ws.nicId = crypto.randomBytes(16).toString("hex");

                    connections[ws.nicId] = ws;

                    ws.on("cranker__headerPacketReceived", _ => {
                        delete connections[ws.nicId];
                        connectEstablish();
                    });
                    ws.on("open", () => {
                        if (closingState) {
                            ws.close();
                        }
                        routerState.lastConnectTime = new Date()
                    });
                    ws.on("close", _ => {
                        console.log("router web socket end", ws.nicId, routerAuthority, route, targetLocation);
                        delete connections[ws.nicId];
                    });
                    ws.on("error", (err) => {
                        console.log("router web socket error", ws.nicId, err, routerAuthority, route, targetLocation);
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

        Array.prototype.push.apply(routers, routerList);

        // We need to do this timeout because of a bug in router we think... this is fixed elsewhere but not in the current github version
        setTimeout(_ => resolve(routerClusterObject), 1000);
    });
};

module.exports = connectToRouters;

// End
