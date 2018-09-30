// -*- js-indent-level: 4 -*-

const { spawn } = require("child_process");
const fs = require("./fsasync.js");
const path = require("path");


Array.prototype.mapAsync = async function (fn) {
    let result = [];
    for (let t of this) { result.push(await fn(t)); }
    return result;
};

Array.prototype.filterAsync = async function (fn) {
    let result = [];
    for (let t of this) {
        let include = await fn(t);
        if (include) {
            result.push(t);
        }
    }
    return result;
};

async function findPathDir(exe, pathVar) {
    pathVar = pathVar !== undefined ? pathVar : process.env["PATH"];
    let pathParts = pathVar.split(path.delimiter);    
    let existsModes = fs.constants.R_OK;
    let existing = await pathParts
        .filterAsync(async p => await fs.promises.access(p, existsModes));
    let lists = await existing.mapAsync(
        async p => [p, await fs.promises.readdir(p)]
    );
    let exePlaces = lists.filter(n => n[1].find(s => s==exe || s==exe + ".exe") !== undefined);
    if (exePlaces.length > 0) {
        let [place, list] = exePlaces[0];
        return place;
    }
}

let startCrankerRouter = async function () {
    let javaBinDir = await findPathDir("java");
    let javaBin = path.join(javaBinDir, process.platform === "win32" ? "java.exe" : "java");
    let javaExists = await fs.promises.access(javaBin, fs.constants.R_OK);
    if (!javaExists) {
        return [new Error("no java could be found in PATH")];
    }
    let crankerLogback = path.join(__dirname, "logback.xml");
    let crankerRouterJar = path.join(__dirname, "crank4j-router-1.0-SNAPSHOT.jar");
    let crankerRouterProperties = path.join(__dirname, "router.properties");
    let child = spawn(javaBin, [
        `-Dlogback.configurationFile=${crankerLogback}`,
        "-Dapp.version=1.0-SNAPSHOT",
        "-jar",
        crankerRouterJar,
        crankerRouterProperties
    ]);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    return [undefined, child];
}

module.exports = startCrankerRouter;

// End
