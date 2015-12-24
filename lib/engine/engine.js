"use strict";
var EventEmitter = require('events');
var Memory = require('./memory.js');
var Channel = require('../channel.js');
//var Error = require('../error.js');
var Connection = require('./connection.js');
var logger = new (require('../logging.js'))('Engine');
class Engine extends EventEmitter {
    constructor(options) {
        super();
        this.METHODS = ['createClient', 'clientExists', 'destroyClient', 'ping', 'subscribe', 'unsubscribe'];
        this.MAX_DELAY = 0;
        this.INTERVAL = 0;
        this.TIMEOUT = 60;

        this._options = options || {};
        this._connections = {};
        this.interval = this._options.interval || this.INTERVAL;
        this.timeout = this._options.timeout || this.TIMEOUT;

        this._engine = new Memory(this, this._options);


        var self = this;
        this.METHODS.forEach(function (method) {
            self[method] = function () {
                return self._engine[method].apply(this._engine, arguments);
            };
        });

        this.on('close', function (clientId) {
            var self = this;
            process.nextTick(function () {
                self.flushConnection(clientId)
            });
        }, this);

        logger.debug('Created new engine: %s', JSON.stringify(this._options));
    }

    connect(clientId, options, callback, context) {
        logger.debug('Accepting connection from %s', clientId);
        this._engine.ping(clientId);
        var conn = this.connection(clientId, true);
        conn.connect(options, callback, context);
        this._engine.emptyQueue(clientId);
    }

    hasConnection(clientId) {
        return this._connections.hasOwnProperty(clientId);
    }

    connection(clientId, create) {
        var conn = this._connections[clientId];
        if (conn || !create) return conn;
        this._connections[clientId] = new Connection(this, clientId);
        this.emit('connection:open', clientId);
        return this._connections[clientId];
    }

    closeConnection(clientId) {
        logger.debug('Closing connection for %s', clientId);
        var conn = this._connections[clientId];
        if (!conn) return;
        if (conn.socket) conn.socket.close();
        this.emit('connection:close', clientId);
        delete this._connections[clientId];
    }

    openSocket(clientId, socket) {
        var conn = this.connection(clientId, true);
        conn.socket = socket;
    }

    deliver(clientId, messages) {
        if (!messages || messages.length === 0) return false;

        var conn = this.connection(clientId, false);
        if (!conn) return false;

        for (var i = 0, n = messages.length; i < n; i++) {
            conn.deliver(messages[i]);
        }
        return true;
    }

    flushConnection(clientId, close) {
        if (!clientId) return;
        logger.debug('Flushing connection for %s', clientId);
        var conn = this.connection(clientId, false);
        if (!conn) return;
        if (close === false) conn.socket = null;
        conn.flush();
        this.closeConnection(clientId);
    }

    close() {
        for (var clientId in this._connections) this.flushConnection(clientId);
        this._engine.disconnect();
    }

    disconnect() {
        if (this._engine.disconnect) return this._engine.disconnect();
    }

    publish(message) {
        var channels = Channel.expand(message.channel);
        return this._engine.publish(message, channels);
    }
}

module.exports = Engine;