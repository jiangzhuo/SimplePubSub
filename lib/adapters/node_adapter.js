"use strict";

var path = require('path'),
    url = require('url'),
    querystring = require('querystring');

var http = require('http');
var https = require('https');
var net = require('net');
var WebSocket = require('faye-websocket');
var EventSource = WebSocket.EventSource;

var Server = require('../server/server');
var SimplePubSub = require('../index.js');
class NodeAdapter {

    constructor(options) {

        this.DEFAULT_ENDPOINT = '/bayeux';
        this.TYPE_JSON = {'Content-Type': 'application/json; charset=utf-8'};
        this.TYPE_SCRIPT = {'Content-Type': 'text/javascript; charset=utf-8'};
        this.TYPE_TEXT = {'Content-Type': 'text/plain; charset=utf-8'};
        this.VALID_JSONP_CALLBACK = /^[a-z_\$][a-z0-9_\$]*(\.[a-z_\$][a-z0-9_\$]*)*$/i;


        this._options = options || {};
        WebSocket.validateOptions(this._options, ['engine', 'mount', 'ping', 'timeout', 'extensions', 'websocketExtensions']);

        this._extensions = [];
        this._endpoint = this._options.mount || this.DEFAULT_ENDPOINT;
        this._endpointRe = new RegExp('^' + this._endpoint.replace(/\/$/, '') + '(/[^/]*)*(\\.[^\\.]+)?$');
        this._server = new Server(this._options);

        var extensions = this._options.extensions,
            websocketExtensions = this._options.websocketExtensions,
            i, n;

        if (extensions) {
            extensions = [].concat(extensions);
            for (i = 0, n = extensions.length; i < n; i++)
                this.addExtension(extensions[i]);
        }

        if (websocketExtensions) {
            websocketExtensions = [].concat(websocketExtensions);
            for (i = 0, n = websocketExtensions.length; i < n; i++)
                this.addWebsocketExtension(websocketExtensions[i]);
        }
    }

    addExtension(extension) {
        return this._server.addExtension(extension);
    }

    removeExtension(extension) {
        return this._server.removeExtension(extension);
    }

    addWebsocketExtension(extension) {
        this._extensions.push(extension);
    }

    close() {
        return this._server.close();
    }

    //getClient() {
    //    return this._client = this._client || new SimplePubSub.Client(this._server);
    //}

    attach(server) {
        if (server instanceof http.Server || server instanceof https.Server) {
            console.log('attach http(s) server');
            this._overrideListeners(server, 'request', 'handle');
            this._overrideListeners(server, 'upgrade', 'handleUpgrade');
        } else if (server instanceof net.Server) {
            console.log('attach net server');
            this._overrideListeners(server, 'connection', 'handleConnection');
        }
    }

    _overrideListeners(server, event, method) {
        var listeners = server.listeners(event),
            self = this;

        server.removeAllListeners(event);

        server.on(event, function (request) {
            if (server instanceof net.Server) return self[method].apply(self, arguments);
            if (self.check(request))  return self[method].apply(self, arguments);

            for (var i = 0, n = listeners.length; i < n; i++)
                listeners[i].apply(this, arguments);
        });
    }

    check(request) {
        var path = url.parse(request.url, true).pathname;
        return !!this._endpointRe.test(path);
    }

    handle(request, response) {
        var requestUrl = url.parse(request.url, true),
            requestMethod = request.method,
            self = this;

        request.originalUrl = request.url;

        request.on('error', function (error) {
            self._returnError(response, error)
        });
        response.on('error', function (error) {
            self._returnError(null, error)
        });

        if (requestMethod === 'OPTIONS' || request.headers['access-control-request-method'] === 'POST')
            return this._handleOptions(response);

        if (EventSource.isEventSource(request))
            return this.handleEventSource(request, response);

        if (requestMethod === 'GET')
            return this._callWithParams(request, response, requestUrl.query);

        if (requestMethod === 'POST')
            return this._concatStream(request, function (data) {
                var type = (request.headers['content-type'] || '').split(';')[0],
                    params = (type === 'application/json')
                        ? {message: data}
                        : querystring.parse(data);

                request.body = data;
                this._callWithParams(request, response, params);
            }, this);

        this._returnError(response, {message: 'Unrecognized request type'});
    }

    _callWithParams(request, response, params) {
        if (!params.message)
            return this._returnError(response, {message: 'Received request with no message: ' + this._formatRequest(request)});

        try {
            console.log('Received message via HTTP ' + request.method + ': %s', params.message);

            var message = JSON.parse(params.message),
                jsonp = params.jsonp || 'jsonpcallback',
                isGet = (request.method === 'GET'),
                type = isGet ? this.TYPE_SCRIPT : this.TYPE_JSON,
                headers = Object.assign({}, type),
                origin = request.headers.origin;

            if (!this.VALID_JSONP_CALLBACK.test(jsonp))
                return this._returnError(response, {message: 'Invalid JSON-P callback: ' + jsonp});

            if (origin) headers['Access-Control-Allow-Origin'] = origin;
            headers['Cache-Control'] = 'no-cache, no-store';
            headers['X-Content-Type-Options'] = 'nosniff';

            this._server.process(message, request, function (replies) {
                var body = JSON.stringify(replies);

                if (isGet) {
                    body = '/**/' + jsonp + '(' + this._jsonpEscape(body) + ');';
                    headers['Content-Disposition'] = 'attachment; filename=f.txt';
                }

                headers['Content-Length'] = new Buffer(body, 'utf8').length.toString();
                headers['Connection'] = 'close';

                console.log('HTTP response: %s', body);
                response.writeHead(200, headers);
                response.end(body);
            }, this);
        } catch (error) {
            this._returnError(response, error);
        }
    }

    _jsonpEscape(json) {
        return json.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    }

    handleUpgrade(request, socket, head) {
        var options = {extensions: this._extensions, ping: this._options.ping},
            ws = new WebSocket(request, socket, head, [], options),
            clientId = null,
            self = this;

        request.originalUrl = request.url;

        ws.onmessage = function (event) {
            try {
                console.log('Received message via WebSocket[' + ws.version + ']: %s', event.data);

                var message = JSON.parse(event.data),
                    cid = SimplePubSub.clientIdFromMessages(message);

                console.log('cid and clientId', cid, clientId);
                if (clientId && cid && cid !== clientId) self._server.closeSocket(clientId, false);
                self._server.openSocket(cid, ws, request);
                if (cid) clientId = cid;

                self._server.process(message, request, function (replies) {
                    if (ws) ws.send(JSON.stringify(replies));
                });
            } catch (e) {
                console.error(e.message + '\nBacktrace:\n' + e.stack);
            }
        };

        ws.onclose = function (event) {
            self._server.closeSocket(clientId);
            ws = null;
        };
    }

    handleConnection(socket) {
        var clientId = null,
            self = this;

        socket.on('data', function (data) {

            try {
                console.log('Received message via Socket', data.toString());

                var message = JSON.parse(data),
                    cid = SimplePubSub.clientIdFromMessages(message);

                console.log('cid and clientId', cid, clientId);
                if (clientId && cid && cid !== clientId) self._server.closeSocket(clientId, false);
                self._server.openSocket(cid, socket);
                if (cid) clientId = cid;

                self._server.process(message, socket, function (replies) {
                    if (socket && socket.writable) socket.write(JSON.stringify(replies));
                });
            } catch (e) {
                console.error(e.message + '\nBacktrace:\n' + e.stack);
            }
        });

        socket.on('close', function () {
            console.log('socket close', clientId);
            self._server.closeSocket(clientId);
        });
    }

    handleEventSource(request, response) {
        var es = new EventSource(request, response, {ping: this._options.ping}),
            clientId = es.url.split('/').pop(),
            self = this;

        console.log('Opened EventSource connection for %s', clientId);
        this._server.openSocket(clientId, es, request);

        es.onclose = function (event) {
            self._server.closeSocket(clientId);
            es = null;
        };
    }

    _handleOptions(response) {
        var headers = {
            'Access-Control-Allow-Credentials': 'false',
            'Access-Control-Allow-Headers': 'Accept, Authorization, Content-Type, Pragma, X-Requested-With',
            'Access-Control-Allow-Methods': 'POST, GET',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Max-Age': '86400'
        };

        response.writeHead(200, headers);
        response.end('');
    }

    _concatStream(stream, callback, context) {
        var chunks = [],
            length = 0;

        stream.on('data', function (chunk) {
            chunks.push(chunk);
            length += chunk.length;
        });

        stream.on('end', function () {
            var buffer = new Buffer(length),
                offset = 0;

            for (var i = 0, n = chunks.length; i < n; i++) {
                chunks[i].copy(buffer, offset);
                offset += chunks[i].length;
            }
            callback.call(context, buffer.toString('utf8'));
        });
    }

    _formatRequest(request) {
        var method = request.method.toUpperCase(),
            string = 'curl -X ' + method;

        string += " 'http://" + request.headers.host + request.url + "'";
        if (method === 'POST') {
            string += " -H 'Content-Type: " + request.headers['content-type'] + "'";
            string += " -d '" + request.body + "'";
        }
        return string;
    }

    _returnError(response, error) {
        var message = error.message;
        if (error.stack) message += '\nBacktrace:\n' + error.stack;
        console.error(message);

        if (!response) return;

        response.writeHead(400, this.TYPE_TEXT);
        response.end('Bad request');
    }

    on() {
        return this._server._engine.on.apply(this._server._engine, arguments);
    }
}


module.exports = NodeAdapter;