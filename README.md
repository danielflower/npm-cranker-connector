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

```javascript
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

```javascript
let listener = demoServer.listen(0, "localhost", function () {
  let port = listener.address().port;
  let routerCluster = await connectToRouters(["cranker.example.org:16489"], "demo", "http://localhost:" + port);

  // ... and then later when you want to shutdown ...
  routerCluster.close();
  demoServer.close();
});
```

## Doc

Here are docs for the functions and objects.

### connectToRouters(cranker-router-authority-list, route-prefix, target-location, options)

A function to connect to the crankers specified in the
`cranker-router-authority-list` with the specified
`route-prefix`. Requests from the cranker routers will be proxied to
the `target-location` which is an `http` or `https` base URI.

Parameter `cranker-router-authority-list` - an Array of authorities (host name +
":" + port) which specify cranker routers. The cranker routers are
presumed to run version 1.0 of the cranker protocol and to be
available on `wss`.

The function returns a Promise which resolves to a RouterCluster
object. 

***Security notice** -- there is no facility for specifying
certificate options for cranker right now. You can eiher turn off TLS
certifcate validation (see Turning Off Node Certifcate Validation,
below) or use only operating system trusted certifcates.*

Parameter `route-prefix` - a string which will be used by cranker router to send
traffic to this connector.

It does not include the leading `/`.

For example, if you want a cranker router to send you traffic directed
to the router's `/demo` such as `/demo/new-car` or just `/demo`, then
you would use the route prefix: `demo`.


Parameter `target-location` - a string which specifies the base URI (scheme +
"//" + authority and *no* path) for the target server. The target
server you are proxying requests to from the cranker router.

Examples are: `http://www.example.com:8100` or `http://localhost:3100`.

***Security notice** -- npm-cranker-connector does not support proxying
to `https` currently*


Parameter `options` - an associative object of optional features which
may alter or further specify the behaviour of the connector.

Currently the following options only are supported:

* `limit` - an integer expressing the limit of idle connections to the
  cranker router; the cranker connector will attempt to keep this
  number of idle connections open


### Router Cluster Object

RouterCluster objects have 2 members:

* `close`: a function which will shutdown all the idle cranker-router websocket connections
* `routers`: an array of router objects, see Router Object, below

RouterClusters also emit events. These are the primary way of tracking
what's going on inside the cranker connector.

Here's the list of events:

* `routerConnecting` from a RouterObject
  * the RouterObject is trying to connect it's connections to the cranker router
* `crankerHeadersReceived` from a RouterObject connection
  * a connection has received a header from the cranker router so the
   connection is no longer idle and another connection to the router
   needs to be obtained
  * quite low level debug
* `crankerFrameReceived` from a RouterObject's connection
  * cranker router has sent us a web socket frame
  * very low level debug
* `crankerConnected` from a RouterObject's connection
  * a socket has connected to cranker router
  * very low level debug
* `crankedTargetResponse` from a RouterObject's connection
  * we made a request to and received a response from a proxy target
  * the event includes data on the request and the response as well as
    the associated cranker router websocket
  * quite low level debug
* `crankedRouterConnecting` from a RouterObject
  * the router is trying to create the `limit` number of idle
    connections to the relevant cranker router
  * includes data on:
    * the relevant cranker router authority
    * the current idle connection count
    * the idle connection limit
  * very low level debug
* `crankedSocketClose` from a RouterObject's connection
  * a web socket to a cranker router is closing, because it has
    completed it's request or because there was an error
* `crankedSocketError` from a RouterObject's connection
  * a web socket to a cranker router has caused an error
  * includes data on the relevant web socket and the error
  * quite low level debug
* `crankedPing` from a RouterObject
  * response to a ping to a cranker router websocket
  * includes data on the state of the socket which is a websocket readyState
  * very low level debug

### Router Object

An object which represents the connectivity to an individual cranker
router. 

There might be multiple idle connections to a cranker router.

A Router Object has 2 members:

* `connections`: a map of connection objects, keyed by an Id
* `interval`: the polling timer to check the router's idle connection limit is fully met


## Turning Off Node Certificate Validation

Because you cannot specify certifcates for self signed certificate
cranker routers, you may want to turn off Node's TLS libraries
certificate validation.

This can be achieved like this:

```javascript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
```

***Security notice** This is a blanket act. So please do not do this if
you do not know what you are doing. It should NOT be included in
production code.*


## Testing

You can run `test.js` but you need a java binary in the PATH
somewhere. It should be a JRE or JDK 8.

The repository includes a pre-compiled crank4j router on JDK8.

If a java cannot be found the test will `process.exit`.
