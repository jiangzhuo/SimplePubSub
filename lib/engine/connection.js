"use strict";
var Timeouts = require('../timeouts.js');
class Connection extends Timeouts {
    constructor(engine, id, options) {
        super();
        this._engine = engine;
        this._id = id;
        this._options = options;
        this._inbox = [];
    }

    deliver(message) {
        delete message.clientId;
        if (this.socket) return this.socket.send(message);
        this._inbox.push(message);
        this._beginDeliveryTimeout();
    }

    connect(options, callback, context) {
        options = options || {};
        var timeout = (options.timeout !== undefined) ? options.timeout / 1000 : this._engine.timeout;

        this.finalizeCallback = callback;
        this.finalizeContext = context;
        this._beginDeliveryTimeout();
        this._beginConnectionTimeout(timeout);
    }

    flush() {
        this.removeTimeout('connection');
        this.removeTimeout('delivery');

        //this.setDeferredStatus('succeeded', this._inbox);
        if (this.finalizeCallback) {
            this.finalizeCallback.call(this.finalizeContext, this._inbox);
        }
        this._inbox = [];

        if (!this.socket) this._engine.closeConnection(this._id);
    }

    _beginDeliveryTimeout() {
        if (this._inbox.length === 0) return;
        this.addTimeout('delivery', this._engine.MAX_DELAY, this.flush, this);
    }

    _beginConnectionTimeout(timeout) {
        this.addTimeout('connection', timeout, this.flush, this);
    }
}

module.exports = Connection;