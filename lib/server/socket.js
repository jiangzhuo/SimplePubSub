"use strict";

class Socket {
    constructor(server, socket, request) {
        this._server = server;
        this._socket = socket;
        this._request = request;
    }

    send(message) {
        this._server.pipeThroughExtensions('outgoing', message, this._request, function (pipedMessage) {
            if (this._socket) {
                if (this._socket.send) return this._socket.send(JSON.stringify([pipedMessage]));
                if (this._socket.write) return this._socket.write(JSON.stringify([pipedMessage]));
            }
        }, this);
    }

    close() {
        if (this._socket) {
            if (this._socket.close)this._socket.close();
            if (this._socket.destroy)this._socket.destroy();
        }
        delete this._socket;
    }
}

module.exports = Socket;