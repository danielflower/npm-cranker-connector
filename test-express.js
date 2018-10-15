// -*- js-indent-level: 4 -*-

// Tests for express stuff just to prove it works
//
// We also test fetch here.


const http = require("http");
const https = require("https");
const connectToRouters = require("./crankconnect.js");
const startCrankerRouter = require("./start-cranker-router.js");
const querystring = require("querystring");
const assert = require("assert");
const fetch = require("node-fetch");
const FormData = require("form-data");
const express = require("express");
const multer = require("multer");
const app = express();
const upload = multer();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

app.post("/demo-upload", upload.array(), function (request, response) {
    let uploaded = request.body;
    console.log("uploaded", uploaded);
    response.send(`<h1>hello ${uploaded.name}</h1>`);
});

let main = async function() {
    let [routerError, childProcess] = await startCrankerRouter();
    if (routerError !== undefined) {
        console.log("test error", routerError);
        process.exit(1);
    }

    let listener = app.listen(8300, async function () {
        let address = listener.address();
        console.log("express listening on", address.port);

        let routers = await new Promise(async (resolve, reject) => {
            let routers = await connectToRouters(
                ["localhost:16489"],
                "demo-upload",
                "http://localhost:8300", {
                    deferConnect: true
                }
            );
            // routers.on
            routers.once("crankerConnected", function () { resolve(routers); });
            routers.connect();
        });

        let testFetch = async function () {
            let fd = new FormData();
            fd.append("name", "nic");
            fd.append("pass", "secret");
            let response = await fetch("https://localhost:8443/demo-upload", {
                method: "POST",
                body: fd
            });
            return response;
        }

        let response = await testFetch();
        let html = await response.text();

        listener.close();
        routers.close();
        childProcess.kill("SIGTERM");

        assert.deepStrictEqual(html, "<h1>hello nic</h1>");
        return 0;
    });
};

main().then(data => {});

// End
