# Cranker Connector for Javascript

[Daniel Flower's crank4j](https://github.com/danielflower/crank4j) is
a reverse proxy which provides implicit discovery behaviour.

This is a cranker connector library for javascript so javascript
clients can connect to crankers.

## Install

Simply:

```
npm install cranker-connector
```

## Example

You can embed and use this in your service like this:

```
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

demoServer.listen(8300, function () {
  let routerCluster = await connectToRouters(["cranker.example.org:16489"], "demo", "http://localhost:8300");

  // ... and then later when you want to shutdown ...
  routerCluster.close();
  demoServer.close();
});
```

### Using a randomly allocated local server port

Because cranker is providing your routing you do not need an
addressable local server, instead make a server on port 0 and a port
will be dynamically allocated by the operating system:

```
let listener = demoServer.listen(0, "localhost", function () {
  let port = listener.address().port;
  let routerCluster = await connectToRouters(["cranker.example.org:16489"], "demo", "http://localhost:" + port);

  // ... and then later when you want to shutdown ...
  routerCluster.close();
  demoServer.close();
});
```
